from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ValidationError, field_validator
from typing import List, Optional, Dict, Any, Literal
import uuid
from datetime import datetime, timedelta
import jwt
from passlib.hash import bcrypt
import asyncio
import json
import base64
from io import BytesIO
from PIL import Image

# Database (MySQL, async)
import aiomysql

# Google Gemini
import google.generativeai as genai

# Canonical Karnataka cities list for the public GET /api/cities endpoint
# (Requirements 10.1, 10.2, 10.3, 10.4). The tuple is converted to a list at
# import time so successive responses serialise to byte-identical JSON.
from cities import KARNATAKA_CITIES_SORTED

# Risk Engine (pure functions) and Gemini Insights service used by
# POST /api/analyze-risk. Imported at module load so the path is bound once.
from risk_engine import compute_risk
import gemini_insights

# Medical Cost Estimator (deterministic) + AI-assisted contextual refinement.
# The estimator is a pure module that loads the Karnataka hospitals dataset
# once at import time. ``cost_refiner`` is an async coroutine that asks
# Gemini to refine the deterministic estimate within hard backend-defined
# bounds; failures fall back to the deterministic baseline.
import cost_estimator
import cost_refiner

# Bangalore-specific estimator backed by ``blr.xlsx``. Provides a richer,
# fee-driven cost + doctor-recommendation pipeline used only when the selected
# city is Bengaluru/Bangalore. Falls back to the generic estimator when the
# dataset is unavailable (``bangalore_estimator.AVAILABLE`` is False).
import bangalore_estimator

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Gemini configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-1.5-flash')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Note: Using Gemini Vision for OCR (FREE - no billing required!)

# MySQL connection (async pool)
MYSQL_HOST = os.environ.get('MYSQL_HOST', 'localhost')
MYSQL_PORT = int(os.environ.get('MYSQL_PORT', '3306'))
MYSQL_DB = os.environ.get('MYSQL_DB', 'health_assistant')
MYSQL_USER = os.environ.get('MYSQL_USER', 'root')
MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD', '')

db_pool: Optional[aiomysql.Pool] = None

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_DAYS = 30


async def ensure_database_pool() -> aiomysql.Pool:
    """Create an aiomysql pool, creating the target database if it doesn't exist."""
    try:
        return await aiomysql.create_pool(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            db=MYSQL_DB,
            autocommit=True,
            minsize=1,
            maxsize=10,
            charset="utf8mb4",
        )
    except Exception as e:
        msg = str(e)
        if "Unknown database" in msg or "1049" in msg:
            temp_pool = await aiomysql.create_pool(
                host=MYSQL_HOST,
                port=MYSQL_PORT,
                user=MYSQL_USER,
                password=MYSQL_PASSWORD,
                autocommit=True,
                minsize=1,
                maxsize=2,
                charset="utf8mb4",
            )
            try:
                async with temp_pool.acquire() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute(
                            f"CREATE DATABASE IF NOT EXISTS `{MYSQL_DB}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                        )
                        await conn.commit()
            finally:
                temp_pool.close()
                await temp_pool.wait_closed()

            return await aiomysql.create_pool(
                host=MYSQL_HOST,
                port=MYSQL_PORT,
                user=MYSQL_USER,
                password=MYSQL_PASSWORD,
                db=MYSQL_DB,
                autocommit=True,
                minsize=1,
                maxsize=10,
                charset="utf8mb4",
            )
        raise

async def fetch_one(query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
    if db_pool is None:
        raise RuntimeError('Database pool is not initialized')
    async with db_pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(query, params)
            return await cur.fetchone()

async def fetch_all(query: str, params: tuple = ()) -> List[Dict[str, Any]]:
    if db_pool is None:
        raise RuntimeError('Database pool is not initialized')
    async with db_pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(query, params)
            return await cur.fetchall()

async def execute(query: str, params: tuple = ()) -> int:
    if db_pool is None:
        raise RuntimeError('Database pool is not initialized')
    async with db_pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(query, params)
            last_id = cur.lastrowid or 0
            await conn.commit()
            return last_id

async def _ensure_column(cur, table: str, column: str, ddl: str) -> None:
    """Idempotently add `column` to `table` with the given DDL.

    Reads INFORMATION_SCHEMA.COLUMNS in the current database and only runs
    `ALTER TABLE ... ADD COLUMN ...` when the column is not already present.
    Never drops, renames, or retypes an existing column.
    """
    await cur.execute(
        """
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s
        """,
        (table, column),
    )
    row = await cur.fetchone()
    if row is None:
        await cur.execute(f"ALTER TABLE `{table}` ADD COLUMN `{column}` {ddl}")


async def init_db(conn: aiomysql.Connection):
    async with conn.cursor() as cur:
        # users
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at DATETIME NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )
        # health_profiles
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS health_profiles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                sleep_pattern VARCHAR(64) NOT NULL,
                sleep_hours INT NOT NULL,
                hydration_level VARCHAR(64) NOT NULL,
                stress_level VARCHAR(64) NOT NULL,
                exercise_frequency VARCHAR(64) NOT NULL,
                diet_type VARCHAR(64) NOT NULL,
                existing_conditions TEXT NULL,
                lifestyle_notes TEXT NULL,
                health_persona TEXT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )
        # chat_messages
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                role VARCHAR(16) NOT NULL,
                content LONGTEXT NOT NULL,
                timestamp DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )
        # reminders
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS reminders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                reminder_type VARCHAR(64) NOT NULL,
                frequency_hours INT NOT NULL,
                message TEXT NOT NULL,
                is_sarcastic BOOLEAN NOT NULL,
                is_active BOOLEAN NOT NULL,
                last_sent DATETIME NULL,
                created_at DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )
        # daily_steps
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_steps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                date DATE NOT NULL,
                step_count INT NOT NULL DEFAULT 0,
                goal INT NOT NULL DEFAULT 6000,
                updated_at DATETIME NOT NULL,
                UNIQUE KEY uq_user_date (user_id, date),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )
        # meditation_sessions
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS meditation_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                duration_seconds INT NOT NULL,
                completed_at DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )
        # prescriptions
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS prescriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                image_path VARCHAR(512) NULL,
                extracted_text LONGTEXT NOT NULL,
                medication_name TEXT NULL,
                dosage TEXT NULL,
                frequency TEXT NULL,
                timing TEXT NULL,
                purpose TEXT NULL,
                side_effects TEXT NULL,
                interactions TEXT NULL,
                personalized_advice LONGTEXT NULL,
                ai_analysis LONGTEXT NOT NULL,
                created_at DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )

        # ---- Eunoia preventive onboarding redesign: idempotent migrations ----
        # Requirement 12.1: extend users with name, email, preferred_city, preferred_state.
        # `email` is already created above for fresh installs; calling _ensure_column
        # is a no-op when the column exists, which is the safe path on legacy DBs too.
        await _ensure_column(cur, "users", "name", "VARCHAR(80) NULL")
        await _ensure_column(cur, "users", "email", "VARCHAR(255) NULL")
        await _ensure_column(cur, "users", "preferred_city", "VARCHAR(64) NULL")
        await _ensure_column(cur, "users", "preferred_state", "VARCHAR(64) NULL")

        # Requirement 12.2: extend health_profiles with the redesigned columns.
        # exercise_frequency and stress_level already exist on health_profiles
        # (see CREATE TABLE above) and are intentionally NOT re-added here per
        # the design note. _ensure_column would be a no-op for them anyway.
        await _ensure_column(cur, "health_profiles", "age", "INT NULL")
        await _ensure_column(cur, "health_profiles", "gender", "VARCHAR(32) NULL")
        await _ensure_column(cur, "health_profiles", "height", "DECIMAL(6,2) NULL")
        await _ensure_column(cur, "health_profiles", "weight", "DECIMAL(6,2) NULL")
        await _ensure_column(cur, "health_profiles", "smoking", "VARCHAR(32) NULL")
        await _ensure_column(cur, "health_profiles", "alcohol", "VARCHAR(32) NULL")
        await _ensure_column(cur, "health_profiles", "sleep_quality", "VARCHAR(32) NULL")
        await _ensure_column(cur, "health_profiles", "water_intake", "VARCHAR(32) NULL")

        # Requirement 12.3: family_history with unique (user_id, condition) and ON DELETE CASCADE.
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS family_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                `condition` VARCHAR(64) NOT NULL,
                created_at DATETIME NOT NULL,
                UNIQUE KEY uq_user_condition (user_id, `condition`),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )

        # Requirement 12.4, 12.6: risk_reports with risk_level ENUM and JSON columns.
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS risk_reports (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                risk_score INT NOT NULL,
                risk_level ENUM('Low', 'Moderate', 'High') NOT NULL,
                wellness_score INT NOT NULL,
                contributing_factors JSON NOT NULL,
                ai_analysis JSON NULL,
                ai_insights_unavailable TINYINT(1) NOT NULL DEFAULT 0,
                payload_snapshot JSON NOT NULL,
                created_at DATETIME NOT NULL,
                KEY idx_user_created (user_id, created_at),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )

        # Cost Estimator history. One row per cost estimate snapshot. The
        # response payload is JSON-encoded for future extensibility (insurance,
        # appointment booking, historical comparison charts, etc.).
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS cost_estimates (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                city VARCHAR(64) NOT NULL,
                condition_label VARCHAR(96) NOT NULL,
                condition_key VARCHAR(64) NOT NULL,
                tier VARCHAR(16) NOT NULL,
                severity VARCHAR(16) NOT NULL,
                consultation_type VARCHAR(32) NOT NULL,
                estimated_total_min INT NOT NULL,
                estimated_total_max INT NOT NULL,
                response_snapshot JSON NOT NULL,
                created_at DATETIME NOT NULL,
                KEY idx_user_created (user_id, created_at),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )

        await conn.commit()

def to_dt(dt: datetime) -> datetime:
    if isinstance(dt, datetime):
        return dt.replace(tzinfo=None)
    return dt

async def gemini_generate(system_message: str, user_text: str) -> str:
    try:
        model = genai.GenerativeModel(model_name=GEMINI_MODEL, system_instruction=system_message)
        resp = await model.generate_content_async(user_text)
        return (resp.text or "").strip()
    except Exception as e:
        logging.error(f"Gemini error: {e}")
        raise

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# ==================== MODELS ====================

class UserRegister(BaseModel):
    username: str
    password: str
    email: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    token: str
    username: str

class HealthProfileCreate(BaseModel):
    sleep_pattern: str
    sleep_hours: int
    hydration_level: str
    stress_level: str
    exercise_frequency: str
    diet_type: str
    existing_conditions: Optional[str] = None
    lifestyle_notes: Optional[str] = None

class HealthProfileResponse(BaseModel):
    id: str
    user_id: str
    sleep_pattern: str
    sleep_hours: int
    hydration_level: str
    stress_level: str
    exercise_frequency: str
    diet_type: str
    existing_conditions: Optional[str]
    lifestyle_notes: Optional[str]
    health_persona: Optional[str]
    created_at: datetime
    updated_at: datetime

class ChatMessageCreate(BaseModel):
    message: str

class ChatMessageResponse(BaseModel):
    role: str
    content: str
    timestamp: datetime

class ChatHistoryResponse(BaseModel):
    messages: List[ChatMessageResponse]

# ==================== ONBOARDING / RISK MODELS ====================

# Hereditary conditions used by the Family History step (Requirement 6.1).
HEREDITARY = {
    'Diabetes',
    'Hypertension',
    'Heart Disease',
    'Asthma',
    'Cancer',
    'Mental Health Disorders',
    'Thyroid Disorders',
    'Obesity',
}


class BasicProfile(BaseModel):
    full_name: str = Field(min_length=1, max_length=80)
    age: int = Field(ge=13, le=120)
    gender: Literal['male', 'female', 'non_binary', 'prefer_not_to_say']
    height_cm: float = Field(ge=80, le=250)
    weight_kg: float = Field(ge=20, le=300)


class Lifestyle(BaseModel):
    smoking: Literal['never', 'former', 'occasional', 'regular']
    alcohol: Literal['never', 'occasional', 'moderate', 'frequent']
    exercise_frequency: Literal['never', 'occasional', 'regular', 'daily']
    water_intake: Literal['low', 'moderate', 'high']
    sleep_quality: Literal['poor', 'fair', 'good', 'excellent']
    stress_level: Literal['low', 'moderate', 'high']


class MedicalHistory(BaseModel):
    existing_conditions: List[str] = Field(default_factory=list, max_length=50)
    allergies: List[str] = Field(default_factory=list, max_length=50)
    current_medications: List[str] = Field(default_factory=list, max_length=50)


class FamilyHistory(BaseModel):
    conditions: List[str] = Field(default_factory=list)

    @field_validator('conditions')
    @classmethod
    def _hereditary(cls, v: List[str]) -> List[str]:
        for item in v:
            if item not in HEREDITARY:
                raise ValueError(f'Unknown hereditary condition: {item}')
        return v


class Location(BaseModel):
    state: Literal['Karnataka'] = 'Karnataka'
    city: str  # cross-validated against KARNATAKA_CITIES at the endpoint


class AnalyzeRiskRequest(BaseModel):
    basic: BasicProfile
    lifestyle: Lifestyle
    medical: MedicalHistory
    family_history: FamilyHistory
    location: Location


class ContributingFactor(BaseModel):
    dimension: str
    component: Literal['cardiovascular', 'metabolic', 'wellness', 'hereditary']
    delta: int


class RiskEngineResult(BaseModel):
    risk_score: int
    risk_level: Literal['Low', 'Moderate', 'High']
    wellness_score: int
    components: Dict[str, int]
    contributing_factors: List[ContributingFactor]


class GeminiInsights(BaseModel):
    preventive_health_insights: str
    lifestyle_recommendations: str
    diet_suggestions: str
    exercise_guidance: str
    mental_wellness_improvements: str
    long_term_wellness_awareness: str
    habit_optimization_recommendations: str


class AnalyzeRiskResponse(BaseModel):
    report_id: int
    wellness_score: int
    risk_score: int
    risk_level: Literal['Low', 'Moderate', 'High']
    contributing_factors: List[ContributingFactor]
    insights: Optional[GeminiInsights]
    ai_insights_unavailable: bool
    created_at: datetime


class SaveReportRequest(BaseModel):
    wellness_score: int
    risk_score: int
    risk_level: Literal['Low', 'Moderate', 'High']
    contributing_factors: List[ContributingFactor]
    insights: Optional[GeminiInsights] = None
    ai_insights_unavailable: bool
    payload_snapshot: Dict[str, Any]

# ==================== AUTH HELPERS ====================

def create_token(username: str) -> str:
    payload = {
        'username': username,
        'exp': datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get('username')
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ==================== PUBLIC ENDPOINTS ====================

# Pre-build the response body once at import time so every call to
# GET /api/cities returns a byte-identical JSON payload (Requirement 10.4).
_CITIES_RESPONSE_BODY: Dict[str, List[str]] = {
    "Karnataka": list(KARNATAKA_CITIES_SORTED)
}


@api_router.get("/cities")
async def get_cities() -> JSONResponse:
    """Return the canonical Karnataka cities list.

    Public endpoint (no auth required, Requirement 10.3). Cached for one hour
    via ``Cache-Control: public, max-age=3600`` (Requirement 10.2).
    """
    return JSONResponse(
        content=_CITIES_RESPONSE_BODY,
        headers={"Cache-Control": "public, max-age=3600"},
    )

# ==================== ONBOARDING / ANALYZE-RISK ENDPOINT ====================

# 256 KB hard limit on the request body (Requirement 9.1, design § "POST
# /api/analyze-risk"). Enforced before any parsing or validation to keep the
# 413 response immediate and to make it impossible for an oversized payload to
# reach the Risk Engine, Gemini, or the database.
_ANALYZE_RISK_MAX_BODY_BYTES: int = 256 * 1024


def _format_validation_errors(exc: ValidationError) -> List[Dict[str, Any]]:
    """Render a Pydantic ``ValidationError`` as the canonical 400 detail list.

    Each entry has the shape ``{"loc": [...], "msg": str, "type": str}`` with
    ``loc`` prefixed by ``"body"`` so the frontend can route the error to the
    onboarding step that owns the field (design § "400 body shape").
    """
    detail: List[Dict[str, Any]] = []
    for err in exc.errors():
        loc = ["body", *[str(p) for p in err.get("loc", ())]]
        detail.append(
            {
                "loc": loc,
                "msg": err.get("msg", ""),
                "type": err.get("type", "value_error"),
            }
        )
    return detail


@api_router.post("/analyze-risk", response_model=AnalyzeRiskResponse)
async def analyze_risk(
    request: Request,
    username: str = Depends(verify_token),
) -> AnalyzeRiskResponse:
    """Run the deterministic Risk Engine + Gemini insights for an onboarding
    submission and persist the result.

    Implements Requirements 9.1–9.9 and 12.1–12.4. Latency budget (design):

      * 401 (auth)        — ≤1 s, no DB writes (Requirement 9.2).
      * 400 (validation)  — ≤1 s, no DB writes (Requirement 9.6).
      * 413 (body too big)— immediate, no DB writes (Requirement 9.1).
      * 500 (Risk Engine) — ≤6 s, no Gemini call, no DB writes (Requirement 9.9).
      * 200 happy path    — ≤20 s end-to-end (Requirement 9.5).
    """
    # ---- 256 KB body-size guard (Requirement 9.1). -------------------------
    # Trust the Content-Length header when present so we can reject oversized
    # uploads without buffering them. When the header is absent (chunked
    # transfer encoding), fall back to reading the body and checking its size
    # before handing the bytes to Pydantic.
    raw_body: Optional[bytes] = None
    content_length_header = request.headers.get("content-length")
    if content_length_header is not None:
        try:
            declared_length = int(content_length_header)
        except ValueError:
            declared_length = -1
        if declared_length > _ANALYZE_RISK_MAX_BODY_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Request body exceeds 256 KB limit",
            )
    raw_body = await request.body()
    if len(raw_body) > _ANALYZE_RISK_MAX_BODY_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Request body exceeds 256 KB limit",
        )

    # ---- Pydantic validation (Requirement 9.6). ----------------------------
    try:
        if not raw_body:
            raise ValidationError.from_exception_data(
                "AnalyzeRiskRequest",
                [{"type": "missing", "loc": (), "input": None}],
            )
        body_obj = json.loads(raw_body)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=400,
            detail=[{"loc": ["body"], "msg": f"Invalid JSON: {e.msg}", "type": "value_error.json"}],
        )
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=_format_validation_errors(exc))

    try:
        payload = AnalyzeRiskRequest.model_validate(body_obj)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=_format_validation_errors(exc))

    # ---- City cross-validation against the canonical Karnataka set. --------
    # Requirement 9.6 requires the field-level error shape; keep the path
    # rooted at ``["body", "location", "city"]`` so the Result Screen can
    # route the user back to step 6.
    if payload.location.city not in KARNATAKA_CITIES_SORTED:
        raise HTTPException(
            status_code=400,
            detail=[
                {
                    "loc": ["body", "location", "city"],
                    "msg": "city must be one of the supported Karnataka cities",
                    "type": "value_error.city",
                }
            ],
        )

    # ---- Resolve authenticated user_id (Requirement 9.2 + 12.1). -----------
    user_row = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user_row:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = int(user_row["id"])

    payload_dict = payload.model_dump()

    # ---- Risk Engine (Requirements 9.3, 9.9). ------------------------------
    # 5-second deadline runs the pure function in a worker thread so the event
    # loop stays free. Any timeout / unhandled exception returns 500 *before*
    # Gemini or the database is touched.
    try:
        risk = await asyncio.wait_for(
            asyncio.to_thread(compute_risk, payload_dict),
            timeout=5,
        )
    except asyncio.TimeoutError:
        logger.error("analyze-risk: Risk Engine exceeded 5 s deadline")
        raise HTTPException(status_code=500, detail="Risk analysis failed")
    except Exception:
        logger.exception("analyze-risk: Risk Engine raised")
        raise HTTPException(status_code=500, detail="Risk analysis failed")

    # ---- Gemini insights (Requirements 9.4, 9.5, 9.7, 9.8). ----------------
    # The Gemini service module's own outer cap is 20 s; the analyze endpoint
    # further constrains the wait to 15 s. Any failure path -> insights=None
    # and ai_insights_unavailable=True; persistence still happens.
    insights_dict: Optional[Dict[str, str]] = None
    try:
        insights_dict = await asyncio.wait_for(
            gemini_insights.generate(
                payload_dict,
                risk,
                gemini_call=gemini_generate,
            ),
            timeout=15,
        )
    except asyncio.TimeoutError:
        logger.warning("analyze-risk: Gemini exceeded 15 s deadline")
        insights_dict = None
    except Exception:
        logger.exception("analyze-risk: gemini_insights.generate raised")
        insights_dict = None

    ai_insights_unavailable = insights_dict is None

    # ---- Persistence (Requirements 9.5, 12.1, 12.2, 12.3, 12.4). -----------
    # All four mutations (users upsert, health_profiles upsert, family_history
    # replace, risk_reports insert) execute under a single transaction so a
    # mid-flight failure cannot leave a half-written report.
    if db_pool is None:
        raise RuntimeError("Database pool is not initialized")

    now = to_dt(datetime.utcnow())
    contributing_factors_json = json.dumps(risk["contributing_factors"])
    ai_analysis_json = json.dumps(insights_dict) if insights_dict is not None else None
    payload_snapshot_json = json.dumps(payload_dict, default=str)

    report_id: int = 0
    async with db_pool.acquire() as conn:
        # Switch off autocommit for the duration of the transaction; restore
        # afterwards so the connection is returned to the pool in its default
        # autocommit=True state (matches `ensure_database_pool`).
        await conn.autocommit(False)
        try:
            async with conn.cursor() as cur:
                # users: upsert name, preferred_state, preferred_city.
                await cur.execute(
                    "UPDATE users SET name=%s, preferred_state=%s, preferred_city=%s WHERE id=%s",
                    (
                        payload.basic.full_name,
                        payload.location.state,
                        payload.location.city,
                        user_id,
                    ),
                )

                # health_profiles: upsert all extended onboarding columns.
                # The legacy CREATE TABLE declares several NOT NULL columns
                # (sleep_pattern, sleep_hours, hydration_level, diet_type)
                # that the redesign does not collect. Reuse the redesign
                # values where they semantically overlap (sleep_quality →
                # sleep_pattern, water_intake → hydration_level) and supply
                # safe defaults for the rest so an INSERT against a fresh
                # row never violates the NOT NULL constraints.
                await cur.execute(
                    "SELECT id, created_at FROM health_profiles WHERE user_id=%s LIMIT 1",
                    (user_id,),
                )
                hp_existing = await cur.fetchone()
                if hp_existing:
                    await cur.execute(
                        """
                        UPDATE health_profiles SET
                            age=%s,
                            gender=%s,
                            height=%s,
                            weight=%s,
                            smoking=%s,
                            alcohol=%s,
                            exercise_frequency=%s,
                            sleep_quality=%s,
                            stress_level=%s,
                            water_intake=%s,
                            sleep_pattern=%s,
                            hydration_level=%s,
                            updated_at=%s
                        WHERE user_id=%s
                        """,
                        (
                            payload.basic.age,
                            payload.basic.gender,
                            payload.basic.height_cm,
                            payload.basic.weight_kg,
                            payload.lifestyle.smoking,
                            payload.lifestyle.alcohol,
                            payload.lifestyle.exercise_frequency,
                            payload.lifestyle.sleep_quality,
                            payload.lifestyle.stress_level,
                            payload.lifestyle.water_intake,
                            payload.lifestyle.sleep_quality,
                            payload.lifestyle.water_intake,
                            now,
                            user_id,
                        ),
                    )
                else:
                    await cur.execute(
                        """
                        INSERT INTO health_profiles (
                            user_id,
                            sleep_pattern, sleep_hours, hydration_level,
                            stress_level, exercise_frequency, diet_type,
                            age, gender, height, weight,
                            smoking, alcohol, sleep_quality, water_intake,
                            created_at, updated_at
                        ) VALUES (
                            %s,
                            %s, %s, %s,
                            %s, %s, %s,
                            %s, %s, %s, %s,
                            %s, %s, %s, %s,
                            %s, %s
                        )
                        """,
                        (
                            user_id,
                            payload.lifestyle.sleep_quality,  # sleep_pattern
                            7,                                 # sleep_hours default
                            payload.lifestyle.water_intake,    # hydration_level
                            payload.lifestyle.stress_level,
                            payload.lifestyle.exercise_frequency,
                            "balanced",                        # diet_type default
                            payload.basic.age,
                            payload.basic.gender,
                            payload.basic.height_cm,
                            payload.basic.weight_kg,
                            payload.lifestyle.smoking,
                            payload.lifestyle.alcohol,
                            payload.lifestyle.sleep_quality,
                            payload.lifestyle.water_intake,
                            now,
                            now,
                        ),
                    )

                # family_history: replace the user's full set inside the
                # transaction (design § "Persist"). The unique key
                # (user_id, condition) makes the DELETE+INSERT pattern safe.
                await cur.execute(
                    "DELETE FROM family_history WHERE user_id=%s",
                    (user_id,),
                )
                for cond in payload.family_history.conditions:
                    await cur.execute(
                        "INSERT INTO family_history (user_id, `condition`, created_at) VALUES (%s, %s, %s)",
                        (user_id, cond, now),
                    )

                # risk_reports: one row per call, with payload_snapshot,
                # contributing_factors JSON, ai_analysis JSON or NULL, and
                # ai_insights_unavailable flag (Requirement 12.4).
                await cur.execute(
                    """
                    INSERT INTO risk_reports (
                        user_id,
                        risk_score, risk_level, wellness_score,
                        contributing_factors, ai_analysis,
                        ai_insights_unavailable,
                        payload_snapshot, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        user_id,
                        int(risk["risk_score"]),
                        risk["risk_level"],
                        int(risk["wellness_score"]),
                        contributing_factors_json,
                        ai_analysis_json,
                        1 if ai_insights_unavailable else 0,
                        payload_snapshot_json,
                        now,
                    ),
                )
                report_id = int(cur.lastrowid or 0)

            await conn.commit()
        except Exception:
            await conn.rollback()
            logger.exception("analyze-risk: persistence failed")
            raise HTTPException(status_code=500, detail="Failed to persist report")
        finally:
            # Restore the pool's default autocommit mode for the next caller.
            try:
                await conn.autocommit(True)
            except Exception:
                pass

    return AnalyzeRiskResponse(
        report_id=report_id,
        wellness_score=int(risk["wellness_score"]),
        risk_score=int(risk["risk_score"]),
        risk_level=risk["risk_level"],
        contributing_factors=[
            ContributingFactor(**f) for f in risk["contributing_factors"]
        ],
        insights=GeminiInsights(**insights_dict) if insights_dict else None,
        ai_insights_unavailable=ai_insights_unavailable,
        created_at=now,
    )

# ==================== ONBOARDING / SAVE-REPORT + REPORTS ENDPOINTS ====================


def _parse_json_column(value: Any) -> Any:
    """Decode a value coming from a MySQL ``JSON`` column.

    aiomysql may return JSON columns as ``str`` or ``bytes`` depending on
    server / driver version; on some configurations it returns a pre-decoded
    Python object. Handle every shape and return ``None`` (or ``[]`` when the
    caller requests it) on a malformed payload so a single corrupt row never
    blocks the whole history listing.
    """
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        try:
            value = value.decode("utf-8")
        except Exception:
            return None
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, ValueError):
            return None
    return value


@api_router.post("/save-report", status_code=201)
async def save_report(
    payload: SaveReportRequest,
    username: str = Depends(verify_token),
) -> Dict[str, Any]:
    """Persist a Risk_Report row scoped to the JWT subject.

    Implements Requirements 11.1, 11.3, 11.5, 11.7. On any database error the
    handler returns ``500 {"detail": "Failed to persist report"}`` and does
    not surface a partial 201 response.
    """
    user_row = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user_row:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = int(user_row["id"])

    if db_pool is None:
        logger.error("save-report: database pool not initialized")
        raise HTTPException(status_code=500, detail="Failed to persist report")

    now = to_dt(datetime.utcnow())
    contributing_factors_json = json.dumps(
        [f.model_dump() for f in payload.contributing_factors]
    )
    ai_analysis_json = (
        json.dumps(payload.insights.model_dump()) if payload.insights is not None else None
    )
    payload_snapshot_json = json.dumps(payload.payload_snapshot, default=str)

    try:
        async with db_pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO risk_reports (
                        user_id,
                        risk_score, risk_level, wellness_score,
                        contributing_factors, ai_analysis,
                        ai_insights_unavailable,
                        payload_snapshot, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        user_id,
                        int(payload.risk_score),
                        payload.risk_level,
                        int(payload.wellness_score),
                        contributing_factors_json,
                        ai_analysis_json,
                        1 if payload.ai_insights_unavailable else 0,
                        payload_snapshot_json,
                        now,
                    ),
                )
                report_id = int(cur.lastrowid or 0)
            await conn.commit()
    except HTTPException:
        raise
    except Exception:
        logger.exception("save-report: persistence failed")
        raise HTTPException(status_code=500, detail="Failed to persist report")

    return {"id": report_id, "created_at": now}


@api_router.get("/reports", response_model=List[AnalyzeRiskResponse])
async def get_reports(username: str = Depends(verify_token)) -> List[AnalyzeRiskResponse]:
    """Return the authenticated user's Risk_Report rows, newest first.

    Implements Requirements 11.2, 11.3, 11.4, 11.6. Rows are scoped strictly
    by ``user_id`` so a JWT for user A can never observe user B's history.
    Users with no persisted reports receive an empty array (Requirement 11.4).
    """
    user_row = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user_row:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = int(user_row["id"])

    rows = await fetch_all(
        """
        SELECT id, risk_score, risk_level, wellness_score,
               contributing_factors, ai_analysis,
               ai_insights_unavailable, created_at
        FROM risk_reports
        WHERE user_id=%s
        ORDER BY created_at DESC, id DESC
        """,
        (user_id,),
    )

    out: List[AnalyzeRiskResponse] = []
    for row in rows:
        cf_decoded = _parse_json_column(row.get("contributing_factors"))
        cf_list = cf_decoded if isinstance(cf_decoded, list) else []
        ai_decoded = _parse_json_column(row.get("ai_analysis"))
        ai_dict = ai_decoded if isinstance(ai_decoded, dict) else None

        try:
            contributing = [ContributingFactor(**f) for f in cf_list]
        except (TypeError, ValidationError):
            contributing = []

        try:
            insights = GeminiInsights(**ai_dict) if ai_dict is not None else None
        except (TypeError, ValidationError):
            insights = None

        out.append(
            AnalyzeRiskResponse(
                report_id=int(row["id"]),
                wellness_score=int(row["wellness_score"]),
                risk_score=int(row["risk_score"]),
                risk_level=row["risk_level"],
                contributing_factors=contributing,
                insights=insights,
                ai_insights_unavailable=bool(row["ai_insights_unavailable"]),
                created_at=row["created_at"],
            )
        )

    return out


# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user: UserRegister):
    existing_user = await fetch_one("SELECT id FROM users WHERE username=%s", (user.username,))
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")

    hashed_password = bcrypt.hash(user.password)
    created_at = to_dt(datetime.utcnow())
    await execute(
        "INSERT INTO users (username, email, password_hash, created_at) VALUES (%s, %s, %s, %s)",
        (user.username, user.email, hashed_password, created_at)
    )

    token = create_token(user.username)
    return TokenResponse(token=token, username=user.username)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user: UserLogin):
    user_doc = await fetch_one("SELECT id, password_hash FROM users WHERE username=%s", (user.username,))
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not bcrypt.verify(user.password, user_doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(user.username)
    return TokenResponse(token=token, username=user.username)


class UserMeResponse(BaseModel):
    username: str
    name: Optional[str] = None
    email: Optional[str] = None
    preferred_city: Optional[str] = None
    preferred_state: Optional[str] = None


@api_router.get("/auth/me", response_model=UserMeResponse)
async def get_me(username: str = Depends(verify_token)) -> UserMeResponse:
    """Return the authenticated user's profile metadata.

    Used by features (e.g. the Medical Cost Estimator) that need to auto-fill
    the user's onboarding city without re-prompting them.
    """
    row = await fetch_one(
        "SELECT username, name, email, preferred_city, preferred_state "
        "FROM users WHERE username=%s",
        (username,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return UserMeResponse(
        username=row["username"],
        name=row.get("name"),
        email=row.get("email"),
        preferred_city=row.get("preferred_city"),
        preferred_state=row.get("preferred_state"),
    )

# ==================== HEALTH PROFILE ENDPOINTS ====================

@api_router.post("/health/profile", response_model=HealthProfileResponse)
async def create_or_update_health_profile(
    profile: HealthProfileCreate,
    username: str = Depends(verify_token)
):
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = int(user["id"])
    
    persona_prompt = f"""
Based on this health profile, create a fun and engaging "health persona" in 1-2 sentences:

- Sleep Pattern: {profile.sleep_pattern} ({profile.sleep_hours} hours)
- Hydration: {profile.hydration_level}
- Stress Level: {profile.stress_level}
- Exercise: {profile.exercise_frequency}
- Diet: {profile.diet_type}

Make it playful and memorable, like "You're a Night Owl Strategist" or "You're a Zen Snacker".
"""
    
    health_persona = "Health Warrior in Training"

    try:
        response = await gemini_generate(
            "You are a creative health coach who creates fun, memorable health personas.",
            persona_prompt,
        )
        if response:
            health_persona = response
    except Exception as e:
        logging.error(f"Error generating persona: {e}")
    
    existing_profile = await fetch_one(
        "SELECT * FROM health_profiles WHERE user_id=%s",
        (user_id,)
    )

    now = to_dt(datetime.utcnow())
    if existing_profile:
        await execute(
            """
            UPDATE health_profiles
            SET sleep_pattern=%s, sleep_hours=%s, hydration_level=%s, stress_level=%s,
                exercise_frequency=%s, diet_type=%s, existing_conditions=%s, lifestyle_notes=%s,
                health_persona=%s, updated_at=%s
            WHERE user_id=%s
            """,
            (
                profile.sleep_pattern,
                profile.sleep_hours,
                profile.hydration_level,
                profile.stress_level,
                profile.exercise_frequency,
                profile.diet_type,
                profile.existing_conditions,
                profile.lifestyle_notes,
                health_persona,
                now,
                user_id,
            ),
        )
        profile_id = str(existing_profile["id"])
        created_at = existing_profile["created_at"]
        updated_at = now
    else:
        created_at = now
        profile_id_int = await execute(
            """
            INSERT INTO health_profiles (
                user_id, sleep_pattern, sleep_hours, hydration_level, stress_level,
                exercise_frequency, diet_type, existing_conditions, lifestyle_notes,
                health_persona, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_id,
                profile.sleep_pattern,
                profile.sleep_hours,
                profile.hydration_level,
                profile.stress_level,
                profile.exercise_frequency,
                profile.diet_type,
                profile.existing_conditions,
                profile.lifestyle_notes,
                health_persona,
                created_at,
                created_at,
            ),
        )
        profile_id = str(profile_id_int)
        updated_at = created_at

    return HealthProfileResponse(
        id=profile_id,
        user_id=str(user_id),
        sleep_pattern=profile.sleep_pattern,
        sleep_hours=profile.sleep_hours,
        hydration_level=profile.hydration_level,
        stress_level=profile.stress_level,
        exercise_frequency=profile.exercise_frequency,
        diet_type=profile.diet_type,
        existing_conditions=profile.existing_conditions,
        lifestyle_notes=profile.lifestyle_notes,
        health_persona=health_persona,
        created_at=created_at,
        updated_at=updated_at,
    )

@api_router.get("/health/profile", response_model=Optional[HealthProfileResponse])
async def get_health_profile(username: str = Depends(verify_token)):
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = int(user["id"])
    profile = await fetch_one("SELECT * FROM health_profiles WHERE user_id=%s", (user_id,))

    if not profile:
        return None

    return HealthProfileResponse(
        id=str(profile["id"]),
        user_id=str(profile["user_id"]),
        sleep_pattern=profile["sleep_pattern"],
        sleep_hours=profile["sleep_hours"],
        hydration_level=profile["hydration_level"],
        stress_level=profile["stress_level"],
        exercise_frequency=profile["exercise_frequency"],
        diet_type=profile["diet_type"],
        existing_conditions=profile.get("existing_conditions"),
        lifestyle_notes=profile.get("lifestyle_notes"),
        health_persona=profile.get("health_persona"),
        created_at=profile["created_at"],
        updated_at=profile["updated_at"],
    )

# ==================== CHAT ENDPOINTS ====================

@api_router.post("/chat/message", response_model=ChatMessageResponse)
async def send_chat_message(
    message: ChatMessageCreate,
    username: str = Depends(verify_token)
):
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = int(user["id"])

    # Get user's health profile for context
    profile = await fetch_one("SELECT * FROM health_profiles WHERE user_id=%s", (user_id,))
    
    # Build context
    context = "You are a helpful health assistant."
    if profile:
        context += f"\n\nUser's Health Profile:\n"
        context += f"- Persona: {profile.get('health_persona', 'N/A')}\n"
        context += f"- Sleep: {profile.get('sleep_pattern')} ({profile.get('sleep_hours')}h)\n"
        context += f"- Stress: {profile.get('stress_level')}\n"
        context += f"- Exercise: {profile.get('exercise_frequency')}\n"

    # Include recent prescriptions in chat context
    try:
        recent_pres = await fetch_all(
            "SELECT medication_name, dosage, frequency, timing, personalized_advice FROM prescriptions WHERE user_id=%s ORDER BY created_at DESC LIMIT 5",
            (user_id,)
        )
        if recent_pres:
            context += "\n\nRecent Prescriptions:\n"
            for p in recent_pres:
                med = p.get('medication_name') or 'Unknown'
                dosage = p.get('dosage') or ''
                freq = p.get('frequency') or p.get('timing') or ''
                context += f"- {med}: {dosage} {freq}\n"
            context += "\nWhen relevant, you may reference these prescriptions and suggest actions like 'take this medicine from your prescription' while reminding the user to follow doctor's instructions."
    except Exception:
        pass
    
    # Save user message
    user_ts = to_dt(datetime.utcnow())
    await execute(
        "INSERT INTO chat_messages (user_id, role, content, timestamp) VALUES (%s, %s, %s, %s)",
        (user_id, "user", message.message, user_ts),
    )
    
    # Get AI response
    try:
        response = await gemini_generate(context, message.message)

        assistant_ts = to_dt(datetime.utcnow())
        await execute(
            "INSERT INTO chat_messages (user_id, role, content, timestamp) VALUES (%s, %s, %s, %s)",
            (user_id, "assistant", response, assistant_ts),
        )

        return ChatMessageResponse(
            role="assistant",
            content=response,
            timestamp=assistant_ts,
        )
    except Exception as e:
        logging.error(f"Error in chat: {e}")
        raise HTTPException(status_code=500, detail="Failed to get AI response")

@api_router.get("/chat/history", response_model=ChatHistoryResponse)
async def get_chat_history(
    limit: int = 50,
    username: str = Depends(verify_token)
):
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = int(user["id"])

    rows = await fetch_all(
        "SELECT role, content, timestamp FROM chat_messages WHERE user_id=%s ORDER BY timestamp ASC LIMIT %s",
        (user_id, int(limit)),
    )

    return ChatHistoryResponse(
        messages=[
            ChatMessageResponse(
                role=row["role"], content=row["content"], timestamp=row["timestamp"]
            )
            for row in rows
        ]
    )

# ==================== REMINDERS ENDPOINTS ====================

class ReminderCreate(BaseModel):
    reminder_type: str
    frequency_hours: int
    message: str
    is_sarcastic: bool = False

class ReminderResponse(BaseModel):
    id: str
    user_id: str
    reminder_type: str
    frequency_hours: int
    message: str
    is_sarcastic: bool
    is_active: bool
    last_sent: Optional[datetime]
    created_at: datetime

@api_router.post("/reminders/create", response_model=ReminderResponse)
async def create_reminder(
    reminder: ReminderCreate,
    username: str = Depends(verify_token)
):
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = int(user["id"])

    created_at = to_dt(datetime.utcnow())
    new_id = await execute(
        """
        INSERT INTO reminders (user_id, reminder_type, frequency_hours, message, is_sarcastic, is_active, last_sent, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            user_id,
            reminder.reminder_type,
            reminder.frequency_hours,
            reminder.message,
            int(reminder.is_sarcastic),
            1,
            None,
            created_at,
        ),
    )

    return ReminderResponse(
        id=str(new_id),
        user_id=str(user_id),
        reminder_type=reminder.reminder_type,
        frequency_hours=reminder.frequency_hours,
        message=reminder.message,
        is_sarcastic=reminder.is_sarcastic,
        is_active=True,
        last_sent=None,
        created_at=created_at,
    )

@api_router.get("/reminders/active", response_model=List[ReminderResponse])
async def get_active_reminders(username: str = Depends(verify_token)):
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = int(user["id"])

    rows = await fetch_all(
        "SELECT * FROM reminders WHERE user_id=%s AND is_active=1",
        (user_id,),
    )
    results: List[ReminderResponse] = []
    for r in rows:
        results.append(
            ReminderResponse(
                id=str(r["id"]),
                user_id=str(r["user_id"]),
                reminder_type=r["reminder_type"],
                frequency_hours=r["frequency_hours"],
                message=r["message"],
                is_sarcastic=bool(r["is_sarcastic"]),
                is_active=bool(r["is_active"]),
                last_sent=r.get("last_sent"),
                created_at=r["created_at"],
            )
        )
    return results

@api_router.post("/reminders/{reminder_id}/toggle")
async def toggle_reminder(
    reminder_id: str,
    username: str = Depends(verify_token)
):
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = int(user["id"])

    try:
        reminder_id_int = int(reminder_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid reminder ID")

    reminder = await fetch_one(
        "SELECT is_active FROM reminders WHERE id=%s AND user_id=%s",
        (reminder_id_int, user_id),
    )

    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")

    new_status = not bool(reminder["is_active"])
    await execute(
        "UPDATE reminders SET is_active=%s WHERE id=%s",
        (int(new_status), reminder_id_int),
    )

    return {"success": True, "is_active": new_status}

# ==================== PRESCRIPTION ANALYSIS ENDPOINTS ====================

class PrescriptionAnalysisResponse(BaseModel):
    id: str
    user_id: str
    medication_name: str
    dosage: Optional[str]
    frequency: Optional[str]
    timing: Optional[str]
    purpose: Optional[str]
    side_effects: Optional[str]
    interactions: Optional[str]
    personalized_advice: Optional[str]
    extracted_text: str
    ai_analysis: str
    created_at: datetime

async def extract_text_from_image(image_data: bytes) -> str:
    """Extract text from image using Gemini Vision (FREE - no billing required!)."""
    
    try:
        import base64
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        model = genai.GenerativeModel(model_name=GEMINI_MODEL)
        
        prompt = """Extract ALL text from this prescription image exactly as written. 
Include:
- Medication names
- Dosages
- Doctor's instructions
- Frequencies
- Any other text visible

Return ONLY the extracted text, nothing else."""
        
        response = await model.generate_content_async([prompt, {"inline_data": {"mime_type": "image/jpeg", "data": image_base64}}])
        
        extracted_text = response.text.strip()
        
        if not extracted_text or len(extracted_text) < 10:
            raise HTTPException(
                status_code=400,
                detail="Could not extract sufficient text from image. Please ensure the prescription is clear and readable."
            )
        
        logging.info(f"Successfully extracted {len(extracted_text)} characters using Gemini Vision")
        return extracted_text
        
    except Exception as e:
        logging.error(f"Error extracting text from image: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Failed to extract text from image: {str(e)}"
        )

async def analyze_prescription_with_ai(
    extracted_text: str,
    user_health_profile: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Analyze prescription using AI based on extracted text and user's health data."""
    
    context = f"Prescription Text Extracted (OCR):\n{extracted_text}\n\n"
    context += "IMPORTANT: Use the medication names EXACTLY as extracted above - they are correct.\n\n"
    
    if user_health_profile:
        context += "User's Health Profile:\n"
        context += f"- Sleep: {user_health_profile.get('sleep_pattern')} ({user_health_profile.get('sleep_hours')}h)\n"
        context += f"- Stress Level: {user_health_profile.get('stress_level')}\n"
        context += f"- Exercise: {user_health_profile.get('exercise_frequency')}\n"
        context += f"- Diet: {user_health_profile.get('diet_type')}\n"
        if user_health_profile.get('existing_conditions'):
            context += f"- Existing Conditions: {user_health_profile.get('existing_conditions')}\n"
    
    prompt = f"""{context}

Analyze the prescription text above. For EACH medication found:

Use the medication names as written in the extracted text but if the writing is not CLEAR then only do your own research and provide the correct name.

Return a JSON object with this structure:
{{
  "medications": [
    {{
      "medication_name": "name from prescription (Research and verify whether the name corresponds to a real, legally recognized medicine if not then do your research to the closest name from the extracted text and display it.)",
      "dosage": "Dosage information (if not mentioned in prescription or is not very clear or if whatever written does not make sense to be the dosage then do your own research and provide the correct dosage but give a disclaimer that this is based on research and not from the prescription but if clearly mentioned in prescription then use that)",
      "frequency": "How often to take (e.g., 'twice daily', 'every 8 hours' if not mentioned in prescription or is not very clear or if whatever written does not make sense to be the frequency then do your own research and provide the correct frequency but give a disclaimer that this is based on research and not from the prescription but if clearly mentioned in prescription then use that)",
      "timing": "Best time to take (e.g., 'with meals', 'before bedtime')",
      "purpose": "What this medication treats",
      "side_effects": "Common side effects to watch for",
      "interactions": "Interactions with food, lifestyle, or the user's conditions",
      "personalized_advice": "Specific advice based on user's health profile"
    }}
  ],
  "general_advice": "Overall advice for taking these medications together (if multiple)"
}}

Return ONLY valid JSON. If a field is unknown, do your own research and fill in with valid information.
"""

    try:
        response = await gemini_generate(
            system_message="You are an expert pharmacist who corrects OCR errors in prescription text and provides detailed medication guidance. Always return valid JSON.",
            user_text=prompt
        )
        
        try:
            cleaned_response = response.strip()
            if cleaned_response.startswith('```json'):
                cleaned_response = cleaned_response[7:]
            if cleaned_response.startswith('```'):
                cleaned_response = cleaned_response[3:]
            if cleaned_response.endswith('```'):
                cleaned_response = cleaned_response[:-3]
            cleaned_response = cleaned_response.strip()
            
            analysis_data = json.loads(cleaned_response)
            
            medications = analysis_data.get('medications', [])
            if medications:
                med_names = [m.get('medication_name', 'Unknown') for m in medications]
                dosages = [m.get('dosage') for m in medications if m.get('dosage')]
                frequencies = [m.get('frequency') for m in medications if m.get('frequency')]
                timings = [m.get('timing') for m in medications if m.get('timing')]
                purposes = [m.get('purpose') for m in medications if m.get('purpose')]
                
                formatted_sections = []
                for i, med in enumerate(medications, 1):
                    med_section = f"**Medication {i}: {med.get('medication_name', 'Unknown')}**\n\n"
                    if med.get('dosage'):
                        med_section += f"**Dosage:** {med.get('dosage')}\n\n"
                    if med.get('frequency'):
                        med_section += f"**Frequency:** {med.get('frequency')}\n\n"
                    if med.get('timing'):
                        med_section += f"**Timing:** {med.get('timing')}\n\n"
                    if med.get('purpose'):
                        med_section += f"**Purpose:** {med.get('purpose')}\n\n"
                    if med.get('side_effects'):
                        med_section += f"**Side Effects:** {med.get('side_effects')}\n\n"
                    if med.get('interactions'):
                        med_section += f"**Interactions:** {med.get('interactions')}\n\n"
                    if med.get('personalized_advice'):
                        med_section += f"**Personalized Advice:** {med.get('personalized_advice')}\n\n"
                    formatted_sections.append(med_section)
                
                formatted_analysis = "\n---\n\n".join(formatted_sections)
                if analysis_data.get('general_advice'):
                    formatted_analysis += f"\n---\n\n**General Advice:**\n\n{analysis_data.get('general_advice')}"
                
                return {
                    'medication_name': ', '.join(med_names),
                    'dosage': ', '.join(dosages) if dosages else None,
                    'frequency': ', '.join(frequencies) if frequencies else None,
                    'timing': ', '.join(timings) if timings else None,
                    'purpose': '; '.join(purposes) if purposes else None,
                    'side_effects': None,
                    'interactions': None,
                    'personalized_advice': formatted_analysis,
                    'full_analysis': response,
                    'medications': medications
                }
            else:
                analysis_data['full_analysis'] = response
                return analysis_data
                
        except json.JSONDecodeError:
            return {
                'medication_name': 'See full analysis',
                'dosage': None,
                'frequency': None,
                'timing': None,
                'purpose': None,
                'side_effects': None,
                'interactions': None,
                'personalized_advice': response,
                'full_analysis': response
            }
    except Exception as e:
        logging.error(f"Error analyzing prescription with AI: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to analyze prescription: {str(e)}")

@api_router.post("/prescriptions/upload", response_model=PrescriptionAnalysisResponse)
async def upload_prescription(
    file: UploadFile = File(...),
    username: str = Depends(verify_token)
):
    """Upload a prescription image, extract text, and get AI analysis."""
    
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_id = int(user["id"])
    
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        image_data = await file.read()
        extracted_text = await extract_text_from_image(image_data)
        
        if not extracted_text or len(extracted_text) < 10:
            raise HTTPException(
                status_code=400, 
                detail="Could not extract sufficient text from image. Please ensure the image is clear and readable."
            )
        
        profile = await fetch_one("SELECT * FROM health_profiles WHERE user_id=%s", (user_id,))
        
        analysis = await analyze_prescription_with_ai(
            extracted_text=extracted_text,
            user_health_profile=dict(profile) if profile else None,
        )
        
        created_at = to_dt(datetime.utcnow())
        
        def to_string(val):
            if val is None:
                return None
            if isinstance(val, (dict, list)):
                return json.dumps(val)
            return str(val)
        
        prescription_id = await execute(
            """
            INSERT INTO prescriptions (
                user_id, image_path, extracted_text, medication_name, dosage, frequency, 
                timing, purpose, side_effects, interactions, personalized_advice, 
                ai_analysis, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_id,
                None,
                extracted_text,
                to_string(analysis.get('medication_name', 'Unknown')),
                to_string(analysis.get('dosage')),
                to_string(analysis.get('frequency')),
                to_string(analysis.get('timing')),
                to_string(analysis.get('purpose')),
                to_string(analysis.get('side_effects')),
                to_string(analysis.get('interactions')),
                to_string(analysis.get('personalized_advice')),
                to_string(analysis.get('full_analysis', '')),
                created_at
            )
        )
        
        def format_for_response(val):
            if val is None:
                return None
            if isinstance(val, list):
                return ', '.join(str(v) for v in val if v)
            if isinstance(val, dict):
                return json.dumps(val)
            return str(val)
        
        return PrescriptionAnalysisResponse(
            id=str(prescription_id),
            user_id=str(user_id),
            medication_name=format_for_response(analysis.get('medication_name', 'Unknown')),
            dosage=format_for_response(analysis.get('dosage')),
            frequency=format_for_response(analysis.get('frequency')),
            timing=format_for_response(analysis.get('timing')),
            purpose=format_for_response(analysis.get('purpose')),
            side_effects=format_for_response(analysis.get('side_effects')),
            interactions=format_for_response(analysis.get('interactions')),
            personalized_advice=format_for_response(analysis.get('personalized_advice')),
            extracted_text=extracted_text,
            ai_analysis=analysis.get('full_analysis', ''),
            created_at=created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error processing prescription: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process prescription: {str(e)}")

@api_router.get("/prescriptions/history", response_model=List[PrescriptionAnalysisResponse])
async def get_prescription_history(
    limit: int = 20,
    username: str = Depends(verify_token)
):
    """Get user's prescription history."""
    
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_id = int(user["id"])
    
    prescriptions = await fetch_all(
        """
        SELECT * FROM prescriptions 
        WHERE user_id=%s 
        ORDER BY created_at DESC 
        LIMIT %s
        """,
        (user_id, limit)
    )
    
    results = []
    for p in prescriptions:
        results.append(
            PrescriptionAnalysisResponse(
                id=str(p["id"]),
                user_id=str(p["user_id"]),
                medication_name=p["medication_name"],
                dosage=p.get("dosage"),
                frequency=p.get("frequency"),
                timing=p.get("timing"),
                purpose=p.get("purpose"),
                side_effects=p.get("side_effects"),
                interactions=p.get("interactions"),
                personalized_advice=p.get("personalized_advice"),
                extracted_text=p["extracted_text"],
                ai_analysis=p["ai_analysis"],
                created_at=p["created_at"]
            )
        )
    
    return results

@api_router.get("/prescriptions/{prescription_id}", response_model=PrescriptionAnalysisResponse)
async def get_prescription(
    prescription_id: str,
    username: str = Depends(verify_token)
):
    """Get a specific prescription by ID."""
    
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_id = int(user["id"])
    
    try:
        prescription_id_int = int(prescription_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid prescription ID")
    
    prescription = await fetch_one(
        "SELECT * FROM prescriptions WHERE id=%s AND user_id=%s",
        (prescription_id_int, user_id)
    )
    
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")
    
    return PrescriptionAnalysisResponse(
        id=str(prescription["id"]),
        user_id=str(prescription["user_id"]),
        medication_name=prescription["medication_name"],
        dosage=prescription.get("dosage"),
        frequency=prescription.get("frequency"),
        timing=prescription.get("timing"),
        purpose=prescription.get("purpose"),
        side_effects=prescription.get("side_effects"),
        interactions=prescription.get("interactions"),
        personalized_advice=prescription.get("personalized_advice"),
        extracted_text=prescription["extracted_text"],
        ai_analysis=prescription["ai_analysis"],
        created_at=prescription["created_at"]
    )

# ==================== STEPS ENDPOINTS ====================

class StepsLog(BaseModel):
    step_count: int
    goal: Optional[int] = 6000
    date: Optional[str] = None  # YYYY-MM-DD, defaults to today

class StepsResponse(BaseModel):
    date: str
    step_count: int
    goal: int
    goal_reached: bool

class WeeklyStepsResponse(BaseModel):
    days: List[StepsResponse]
    goals_reached_count: int
    total_steps: int

class WalkingAnalysisResponse(BaseModel):
    analysis: str
    avg_steps: int
    trend: str  # "up", "down", "steady"

@api_router.post("/steps/log", response_model=StepsResponse)
async def log_steps(body: StepsLog, username: str = Depends(verify_token)):
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = int(user["id"])
    target_date = body.date or datetime.utcnow().strftime("%Y-%m-%d")
    now = to_dt(datetime.utcnow())

    existing = await fetch_one(
        "SELECT id, step_count FROM daily_steps WHERE user_id=%s AND date=%s",
        (user_id, target_date),
    )
    if existing:
        await execute(
            "UPDATE daily_steps SET step_count=%s, goal=%s, updated_at=%s WHERE id=%s",
            (body.step_count, body.goal, now, existing["id"]),
        )
    else:
        await execute(
            "INSERT INTO daily_steps (user_id, date, step_count, goal, updated_at) VALUES (%s, %s, %s, %s, %s)",
            (user_id, target_date, body.step_count, body.goal, now),
        )

    return StepsResponse(
        date=target_date,
        step_count=body.step_count,
        goal=body.goal,
        goal_reached=body.step_count >= body.goal,
    )


@api_router.get("/steps/today", response_model=StepsResponse)
async def get_steps_today(username: str = Depends(verify_token)):
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = int(user["id"])
    today = datetime.utcnow().strftime("%Y-%m-%d")
    row = await fetch_one(
        "SELECT * FROM daily_steps WHERE user_id=%s AND date=%s", (user_id, today)
    )
    if not row:
        return StepsResponse(date=today, step_count=0, goal=6000, goal_reached=False)
    return StepsResponse(
        date=today,
        step_count=row["step_count"],
        goal=row["goal"],
        goal_reached=row["step_count"] >= row["goal"],
    )


@api_router.get("/steps/week", response_model=WeeklyStepsResponse)
async def get_steps_week(username: str = Depends(verify_token)):
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = int(user["id"])
    today = datetime.utcnow().date()
    start = today - timedelta(days=6)
    rows = await fetch_all(
        "SELECT date, step_count, goal FROM daily_steps WHERE user_id=%s AND date BETWEEN %s AND %s ORDER BY date ASC",
        (user_id, start.isoformat(), today.isoformat()),
    )
    lookup = {str(r["date"]): r for r in rows}
    days: List[StepsResponse] = []
    goals_reached = 0
    total_steps = 0
    for i in range(7):
        d = start + timedelta(days=i)
        ds = d.isoformat()
        if ds in lookup:
            r = lookup[ds]
            sc = r["step_count"]
            g = r["goal"]
        else:
            sc = 0
            g = 6000
        reached = sc >= g
        if reached:
            goals_reached += 1
        total_steps += sc
        days.append(StepsResponse(date=ds, step_count=sc, goal=g, goal_reached=reached))
    return WeeklyStepsResponse(days=days, goals_reached_count=goals_reached, total_steps=total_steps)


@api_router.get("/steps/analysis", response_model=WalkingAnalysisResponse)
async def get_walking_analysis(username: str = Depends(verify_token)):
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = int(user["id"])
    today = datetime.utcnow().date()
    start = today - timedelta(days=6)
    rows = await fetch_all(
        "SELECT step_count FROM daily_steps WHERE user_id=%s AND date BETWEEN %s AND %s ORDER BY date ASC",
        (user_id, start.isoformat(), today.isoformat()),
    )
    steps_list = [r["step_count"] for r in rows]
    avg = int(sum(steps_list) / len(steps_list)) if steps_list else 0

    if len(steps_list) >= 2:
        first_half = steps_list[: len(steps_list) // 2]
        second_half = steps_list[len(steps_list) // 2 :]
        avg1 = sum(first_half) / len(first_half) if first_half else 0
        avg2 = sum(second_half) / len(second_half) if second_half else 0
        if avg2 > avg1 * 1.1:
            trend = "up"
        elif avg2 < avg1 * 0.9:
            trend = "down"
        else:
            trend = "steady"
    else:
        trend = "steady"

    # Generate short AI analysis
    analysis_text = f"Averaging {avg} steps/day."
    try:
        prompt = f"User walked these daily steps over the past week: {steps_list}. Average: {avg}. Trend: {trend}. Give a 1-sentence motivational health insight about their walking habit. Be concise and friendly."
        ai_resp = await gemini_generate(
            "You are a concise health coach. Reply in one short sentence.",
            prompt,
        )
        if ai_resp:
            analysis_text = ai_resp
    except Exception:
        pass

    return WalkingAnalysisResponse(analysis=analysis_text, avg_steps=avg, trend=trend)


# ==================== MEDITATION ENDPOINTS ====================

class MeditationLog(BaseModel):
    duration_seconds: int

class MeditationSessionResponse(BaseModel):
    id: str
    duration_seconds: int
    completed_at: datetime

class WeeklyMeditationResponse(BaseModel):
    days: List[Dict[str, Any]]  # [{date, total_seconds}]
    total_sessions: int
    total_minutes: int

@api_router.post("/meditation/log", response_model=MeditationSessionResponse)
async def log_meditation(body: MeditationLog, username: str = Depends(verify_token)):
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = int(user["id"])
    now = to_dt(datetime.utcnow())
    new_id = await execute(
        "INSERT INTO meditation_sessions (user_id, duration_seconds, completed_at) VALUES (%s, %s, %s)",
        (user_id, body.duration_seconds, now),
    )
    return MeditationSessionResponse(id=str(new_id), duration_seconds=body.duration_seconds, completed_at=now)


@api_router.get("/meditation/week", response_model=WeeklyMeditationResponse)
async def get_meditation_week(username: str = Depends(verify_token)):
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = int(user["id"])
    today = datetime.utcnow().date()
    start = today - timedelta(days=6)
    rows = await fetch_all(
        "SELECT DATE(completed_at) as d, SUM(duration_seconds) as total FROM meditation_sessions WHERE user_id=%s AND DATE(completed_at) BETWEEN %s AND %s GROUP BY DATE(completed_at) ORDER BY d ASC",
        (user_id, start.isoformat(), today.isoformat()),
    )
    lookup = {str(r["d"]): int(r["total"]) for r in rows}
    days = []
    total_seconds = 0
    total_sessions_count = 0
    for i in range(7):
        d = start + timedelta(days=i)
        ds = d.isoformat()
        secs = lookup.get(ds, 0)
        total_seconds += secs
        days.append({"date": ds, "total_seconds": secs})

    sess_count_row = await fetch_one(
        "SELECT COUNT(*) as cnt FROM meditation_sessions WHERE user_id=%s AND DATE(completed_at) BETWEEN %s AND %s",
        (user_id, start.isoformat(), today.isoformat()),
    )
    total_sessions_count = int(sess_count_row["cnt"]) if sess_count_row else 0

    return WeeklyMeditationResponse(
        days=days,
        total_sessions=total_sessions_count,
        total_minutes=total_seconds // 60,
    )


# ==================== HEALTH REPORT GENERATION ====================

from pdf_generator import create_health_report_pdf
from fastapi.responses import StreamingResponse

@api_router.post("/health/generate-report")
@api_router.get("/health/generate-report")
async def generate_health_report(
    token: str = None
):
    """Generate a comprehensive PDF health report for the user."""
    if token:
        from fastapi.security import HTTPAuthorizationCredentials as Creds
        credentials = Creds(scheme="Bearer", credentials=token)
        username = await verify_token(credentials)
    else:
        raise HTTPException(status_code=401, detail="Token required")
    
    user = await fetch_one("SELECT * FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_id = int(user["id"])
    
    try:
        profile = await fetch_one(
            "SELECT * FROM health_profiles WHERE user_id=%s",
            (user_id,)
        )
        
        if not profile:
            raise HTTPException(status_code=404, detail="Health profile not found")
        
        profile_data = dict(profile)
        
        # Generate AI summary using Gemini
        summary_prompt = f"""
        Based on this health data, provide a comprehensive medical summary for a patient report 
        that can be shown to a doctor. Be professional, clear, and concise.
        
        Patient: {username}
        
        Health Profile:
        - Sleep: {profile_data.get('sleep_pattern', 'N/A')} pattern, {profile_data.get('sleep_hours', 'N/A')} hours
        - Hydration: {profile_data.get('hydration_level', 'N/A')}
        - Stress: {profile_data.get('stress_level', 'N/A')}
        - Exercise: {profile_data.get('exercise_frequency', 'N/A')}
        - Diet: {profile_data.get('diet_type', 'N/A')}
        
        Provide a 2-3 paragraph professional medical summary highlighting key patterns, 
        concerns, and positive trends. Focus on actionable insights for healthcare providers.
        """
        
        try:
            ai_summary = await gemini_generate(
                system_message="You are a medical professional creating a health summary for a patient report.",
                user_text=summary_prompt
            )
        except Exception as e:
            logger.error(f"Gemini generation failed: {e}")
            ai_summary = f"""
            Health Summary for {username}:
            
            The patient maintains a health profile with the following attributes:
            Sleep pattern: {profile_data.get('sleep_pattern', 'N/A')}, {profile_data.get('sleep_hours', 'N/A')} hours.
            Hydration level: {profile_data.get('hydration_level', 'N/A')}.
            Stress level: {profile_data.get('stress_level', 'N/A')}.
            Exercise frequency: {profile_data.get('exercise_frequency', 'N/A')}.
            
            This report provides a comprehensive overview of self-reported health data and should be reviewed 
            with the patient for clinical interpretation.
            """
        
        # Fetch recent prescriptions to include in the report
        try:
            pres_rows = await fetch_all(
                "SELECT * FROM prescriptions WHERE user_id=%s ORDER BY created_at DESC LIMIT %s",
                (user_id, 5),
            )
        except Exception:
            pres_rows = []

        prescriptions = []
        for p in pres_rows:
            pr = dict(p)
            for key in ['medication_name', 'dosage', 'frequency', 'timing', 'personalized_advice', 'ai_analysis']:
                val = pr.get(key)
                if isinstance(val, str):
                    pr[key] = val
            prescriptions.append(pr)

        prescription_ai_summary = None
        try:
            if prescriptions:
                meds_list = [p.get('medication_name') or 'Unknown' for p in prescriptions]
                pres_prompt = f"Provide a 2-3 sentence professional summary of the following prescriptions and any high-level safety notes or common interactions. Medications: {', '.join(meds_list)}. Keep it concise for inclusion in a medical report."
                prescription_ai_summary = await gemini_generate(
                    system_message="You are a concise clinical pharmacist summarizing prescriptions for a patient report.",
                    user_text=pres_prompt,
                )
        except Exception:
            prescription_ai_summary = None

        # Generate PDF
        pdf_buffer = create_health_report_pdf(
            username=username,
            profile_data=profile_data,
            ai_summary=ai_summary,
            prescriptions=prescriptions,
            prescription_ai_summary=prescription_ai_summary,
        )
        
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=health_report_{username}_{datetime.now().strftime('%Y%m%d')}.pdf"
            }
        )
        
    except Exception as e:
        logger.error(f"Error generating health report: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate health report: {str(e)}")

# ==================== MEDICAL COST ESTIMATOR ENDPOINTS ====================

class CostEstimateRequest(BaseModel):
    """Inputs for the deterministic medical cost estimator.

    The user's `city` defaults to the value stored on the authenticated user's
    profile during onboarding (`users.preferred_city`). Callers may override
    it explicitly, but if both the request body and the profile are empty the
    endpoint returns a 400 so the UI can prompt for it.
    """

    condition: str = Field(min_length=1, max_length=200)
    city: Optional[str] = Field(default=None, max_length=64)
    severity: Optional[Literal["Mild", "Moderate", "Severe", "mild", "moderate", "severe"]] = None
    hospital_tier: Optional[Literal["Low", "Medium", "High", "low", "medium", "high"]] = None
    consultation_type: Optional[Literal[
        "General", "Specialist", "Follow_up", "Tele",
        "general", "specialist", "follow_up", "tele",
    ]] = None
    save_history: bool = True


class CostBand(BaseModel):
    min: int
    max: int


class CostBreakdown(BaseModel):
    consultation: Optional[CostBand] = None
    tests: Optional[CostBand] = None
    medication: Optional[CostBand] = None
    procedure: Optional[CostBand] = None
    hospitalization: Optional[CostBand] = None


class RecommendedDoctor(BaseModel):
    """A doctor surfaced for a Bangalore hospital recommendation.

    Only populated for Bengaluru results (sourced from ``blr.xlsx``); other
    Karnataka cities never attach doctors.
    """

    name: str
    specialization: str
    qualification: Optional[str] = None
    experience_years: Optional[int] = None
    consultation_fee: Optional[int] = None
    availability: Optional[str] = None
    timing: Optional[str] = None


class MatchedHospital(BaseModel):
    name: str
    city: str
    district: str
    hospital_type: str
    specialization: str
    rating: float
    cost_level: str
    relevance_score: float

    # ── Bangalore-only enrichment (populated from blr.xlsx) ──────────────
    # These remain ``None`` for every other Karnataka city so the existing
    # deterministic pipeline is unaffected.
    area: Optional[str] = None
    tier: Optional[str] = None  # "Low" | "Mid" | "High"
    accreditation: Optional[str] = None
    total_beds: Optional[int] = None
    consultation_fee_min: Optional[int] = None
    consultation_fee_max: Optional[int] = None
    estimated_cost_min: Optional[int] = None
    estimated_cost_max: Optional[int] = None
    doctors: List[RecommendedDoctor] = Field(default_factory=list)


class CostEstimateResponse(BaseModel):
    id: Optional[int] = None
    city: str
    condition: Dict[str, str]
    tier: str
    severity: str
    consultation_type: str

    # Final (possibly AI-refined) total range surfaced to the UI. Always
    # safe to display because the refinement layer is constrained to the
    # deterministic envelope below.
    estimated_total_min: int
    estimated_total_max: int
    breakdown: CostBreakdown

    # Per-tier baseline ranges (only populated when tier == "Auto").
    tier_breakdown: Dict[str, CostBand] = Field(default_factory=dict)
    present_tiers: List[str] = Field(default_factory=list)

    # Deterministic baseline kept alongside the refined values so the UI
    # can show the user where the AI moved the estimate.
    baseline_total_min: int
    baseline_total_max: int
    baseline_breakdown: CostBreakdown

    # Hard envelope the refinement layer was constrained to. Surfaced for
    # transparency / debugging.
    allowed_range: CostBand
    allowed_components: Dict[str, CostBand] = Field(default_factory=dict)

    matched_hospitals: List[MatchedHospital]
    confidence_note: str
    relevance_summary: str

    # True when this estimate came from the Bangalore-specific (blr.xlsx)
    # pipeline, which attaches doctor recommendations, consultation fees, and
    # fee-driven tier classification to each hospital.
    bangalore_mode: bool = False

    # The specialization the symptom text was routed to (Bangalore pipeline
    # only). Surfaced so the UI can show "Matched to: Cardiology" etc.
    mapped_specialization: Optional[str] = None

    # AI-assisted refinement metadata.
    refinement_applied: bool = False
    refinement_reasoning: List[str] = Field(default_factory=list)
    refinement_decline_reason: Optional[str] = None

    created_at: Optional[datetime] = None


class CostEstimateHistoryItem(BaseModel):
    id: int
    city: str
    condition_label: str
    condition_key: str
    tier: str
    severity: str
    consultation_type: str
    estimated_total_min: int
    estimated_total_max: int
    created_at: datetime


@api_router.get("/cost-estimate/conditions")
async def list_cost_conditions() -> Dict[str, Any]:
    """Return the catalog of supported conditions for the estimator UI.

    Public structure; no auth needed because it is purely static catalog data.
    """
    return {
        "conditions": [
            {
                "key": c.key,
                "label": c.label,
                "specializations": list(c.specializations),
            }
            for c in cost_estimator.CONDITION_CATALOG
        ],
        "severities": ["Mild", "Moderate", "Severe"],
        "hospital_tiers": ["Low", "Medium", "High"],
        "consultation_types": ["General", "Specialist", "Follow_up", "Tele"],
    }


@api_router.post("/cost-estimate", response_model=CostEstimateResponse)
async def create_cost_estimate(
    payload: CostEstimateRequest,
    username: str = Depends(verify_token),
) -> CostEstimateResponse:
    """Generate an AI-assisted contextual healthcare cost estimate.

    Two-layer architecture:

      1. ``cost_estimator`` runs deterministically and produces a baseline
         total range, per-line breakdown, hard pricing envelope
         (``allowed_range`` / ``allowed_components``), tier-stratified
         hospital matches, and a confidence note.

      2. ``cost_refiner`` asks Gemini to refine the estimate so it reflects
         realistic healthcare workflow complexity for the condition,
         severity, and tier — strictly inside the envelope from step 1.
         Any failure (timeout, malformed JSON, out-of-bounds output) falls
         back to the deterministic baseline transparently.

    The user always sees a valid estimate; AI is a contextual refinement
    layer, never the source of truth for numeric values.
    """
    user = await fetch_one(
        "SELECT id, preferred_city FROM users WHERE username=%s",
        (username,),
    )
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = int(user["id"])

    city = (payload.city or "").strip() or (user.get("preferred_city") or "").strip()
    if not city:
        raise HTTPException(
            status_code=400,
            detail=[
                {
                    "loc": ["body", "city"],
                    "msg": "city is required (no preferred_city found on profile)",
                    "type": "value_error.city",
                }
            ],
        )

    # ---- Layer 1: deterministic baseline ---------------------------------
    # Conditional routing: Bengaluru/Bangalore uses the richer, fee-driven
    # blr.xlsx pipeline; every other Karnataka city keeps the existing
    # deterministic estimator unchanged.
    use_bangalore = bangalore_estimator.is_bangalore(city) and bangalore_estimator.AVAILABLE
    estimator_fn = bangalore_estimator.estimate if use_bangalore else cost_estimator.estimate
    try:
        baseline = await asyncio.to_thread(
            estimator_fn,
            city=city,
            condition_text=payload.condition,
            severity=payload.severity,
            hospital_tier=payload.hospital_tier,
            consultation_type=payload.consultation_type,
        )
    except Exception:
        logger.exception("cost-estimate: estimator raised")
        raise HTTPException(status_code=500, detail="Failed to generate estimate")

    # Pull fields needed by the refiner before composing the response.
    baseline_breakdown: Dict[str, Dict[str, int]] = dict(baseline.get("breakdown") or {})  # type: ignore[arg-type]
    allowed_components: Dict[str, Dict[str, int]] = dict(baseline.get("allowed_components") or {})  # type: ignore[arg-type]
    allowed_range: Dict[str, int] = dict(baseline.get("allowed_range") or {  # type: ignore[arg-type]
        "min": int(baseline["estimated_total_min"]),
        "max": int(baseline["estimated_total_max"]),
    })

    # Build a one-line summary of the city's hospital availability so the
    # refiner can reason about workflow without needing the full list.
    matched_hospital_summary = _summarize_hospital_pool(baseline.get("matched_hospitals") or [])  # type: ignore[arg-type]

    # Specializations relevant to this condition (used in the prompt).
    specializations: List[str] = []
    cond_meta = cost_estimator.resolve_condition(payload.condition)
    specializations = list(cond_meta.specializations)

    # ---- Layer 2: AI-assisted refinement ---------------------------------
    refinement = cost_refiner.RefinementResult(
        final_min=int(baseline["estimated_total_min"]),
        final_max=int(baseline["estimated_total_max"]),
        components=baseline_breakdown,
        reasoning=[],
        refinement_applied=False,
        decline_reason="gemini_unavailable" if not GEMINI_API_KEY else None,
    )
    if GEMINI_API_KEY:
        try:
            refinement = await asyncio.wait_for(
                cost_refiner.refine(
                    deterministic={
                        **baseline,
                        "specializations": specializations,
                    },
                    matched_hospital_summary=matched_hospital_summary,
                    gemini_call=gemini_generate,
                ),
                timeout=cost_refiner.GEMINI_TIMEOUT_SECONDS + 1,
            )
        except asyncio.TimeoutError:
            logger.warning("cost-estimate: refiner outer timeout")
        except Exception:
            logger.exception("cost-estimate: refiner raised")

    # Persist (best-effort).
    estimate_id: Optional[int] = None
    created_at = to_dt(datetime.utcnow())
    if payload.save_history:
        try:
            snapshot = {
                **baseline,
                "refinement_applied": refinement.refinement_applied,
                "refinement_reasoning": refinement.reasoning,
                "refinement_decline_reason": refinement.decline_reason,
                "final_total_min": refinement.final_min,
                "final_total_max": refinement.final_max,
                "final_components": refinement.components,
            }
            estimate_id = await execute(
                """
                INSERT INTO cost_estimates (
                    user_id, city, condition_label, condition_key,
                    tier, severity, consultation_type,
                    estimated_total_min, estimated_total_max,
                    response_snapshot, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    city,
                    str(baseline["condition"]["label"]),  # type: ignore[index]
                    str(baseline["condition"]["key"]),  # type: ignore[index]
                    str(baseline["tier"]),
                    str(baseline["severity"]),
                    str(baseline["consultation_type"]),
                    int(refinement.final_min),
                    int(refinement.final_max),
                    json.dumps(snapshot, default=str),
                    created_at,
                ),
            )
        except Exception:
            logger.exception("cost-estimate: failed to persist history row")
            estimate_id = None

    # Compose the response. The "estimated_total" pair surfaces the *final*
    # range (refined when applied, baseline otherwise) so the UI can stay
    # the same. Baseline values are exposed as ``baseline_*`` for
    # transparency.
    final_breakdown_payload = {
        line: {"min": int(band["min"]), "max": int(band["max"])}
        for line, band in (refinement.components or baseline_breakdown).items()
    }

    return CostEstimateResponse(
        id=estimate_id,
        city=city,
        condition=baseline["condition"],  # type: ignore[arg-type]
        tier=str(baseline["tier"]),
        severity=str(baseline["severity"]),
        consultation_type=str(baseline["consultation_type"]),
        estimated_total_min=int(refinement.final_min),
        estimated_total_max=int(refinement.final_max),
        breakdown=CostBreakdown(**final_breakdown_payload),  # type: ignore[arg-type]
        tier_breakdown={
            str(t): CostBand(min=int(band["min"]), max=int(band["max"]))
            for t, band in (baseline.get("tier_breakdown") or {}).items()  # type: ignore[union-attr]
        },
        present_tiers=[str(t) for t in (baseline.get("present_tiers") or [])],  # type: ignore[union-attr]
        baseline_total_min=int(baseline["estimated_total_min"]),
        baseline_total_max=int(baseline["estimated_total_max"]),
        baseline_breakdown=CostBreakdown(**baseline_breakdown),  # type: ignore[arg-type]
        allowed_range=CostBand(min=int(allowed_range["min"]), max=int(allowed_range["max"])),
        allowed_components={
            line: CostBand(min=int(band["min"]), max=int(band["max"]))
            for line, band in allowed_components.items()
        },
        matched_hospitals=[MatchedHospital(**h) for h in baseline["matched_hospitals"]],  # type: ignore[arg-type]
        confidence_note=str(baseline["confidence_note"]),
        relevance_summary=str(baseline["relevance_summary"]),
        bangalore_mode=bool(baseline.get("bangalore_mode", False)),
        mapped_specialization=(
            str(baseline["mapped_specialization"])
            if baseline.get("mapped_specialization")
            else None
        ),
        refinement_applied=refinement.refinement_applied,
        refinement_reasoning=list(refinement.reasoning),
        refinement_decline_reason=refinement.decline_reason,
        created_at=created_at,
    )


def _summarize_hospital_pool(hospitals: List[Dict[str, Any]]) -> str:
    """Compact one-line summary used inside the refinement prompt."""
    if not hospitals:
        return "no indexed hospitals matching"
    counts: Dict[str, int] = {"Low": 0, "Medium": 0, "Mid": 0, "High": 0}
    for h in hospitals:
        tier = str(h.get("cost_level", "")).strip()
        if tier in counts:
            counts[tier] += 1
    parts = [f"{c} {t.lower()}-tier" for t, c in counts.items() if c > 0]
    return f"{len(hospitals)} hospitals ({', '.join(parts)})" if parts else f"{len(hospitals)} hospitals"


@api_router.get(
    "/cost-estimate/history",
    response_model=List[CostEstimateHistoryItem],
)
async def get_cost_estimate_history(
    limit: int = 20,
    username: str = Depends(verify_token),
) -> List[CostEstimateHistoryItem]:
    """List the authenticated user's saved cost estimates, newest first."""
    user = await fetch_one("SELECT id FROM users WHERE username=%s", (username,))
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = int(user["id"])
    capped = max(1, min(int(limit or 20), 100))

    rows = await fetch_all(
        """
        SELECT id, city, condition_label, condition_key,
               tier, severity, consultation_type,
               estimated_total_min, estimated_total_max, created_at
        FROM cost_estimates
        WHERE user_id=%s
        ORDER BY created_at DESC, id DESC
        LIMIT %s
        """,
        (user_id, capped),
    )

    return [
        CostEstimateHistoryItem(
            id=int(r["id"]),
            city=r["city"],
            condition_label=r["condition_label"],
            condition_key=r["condition_key"],
            tier=r["tier"],
            severity=r["severity"],
            consultation_type=r["consultation_type"],
            estimated_total_min=int(r["estimated_total_min"]),
            estimated_total_max=int(r["estimated_total_max"]),
            created_at=r["created_at"],
        )
        for r in rows
    ]


# ==================== HEALTH ENDPOINT ====================

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def on_startup():
    global db_pool
    db_pool = await ensure_database_pool()
    async with db_pool.acquire() as conn:
        await init_db(conn)

@app.on_event("shutdown")
async def shutdown_db_client():
    global db_pool
    if db_pool is not None:
        db_pool.close()
        await db_pool.wait_closed()


# Allow `python server.py` to launch the API on the LAN interface so phones on
# the same Wi-Fi can reach it. Bind to 0.0.0.0 (all interfaces) instead of the
# uvicorn default of 127.0.0.1.
if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("server:app", host=host, port=port, reload=False)
