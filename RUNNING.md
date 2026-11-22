# How To Run Eunoia

A step-by-step guide for running Eunoia on a fresh machine. You run two things:

1. **Backend**: a FastAPI server (Python) that talks to MySQL and Google Gemini.
2. **Frontend**: an Expo React Native app that you open on your phone, an Android emulator, or a browser.

Plan for 20–30 minutes the first time. Most of that is installing things.

---

## 0. Install These First

| Tool | Version | Download |
| --- | --- | --- |
| Git | any | https://git-scm.com/downloads |
| Python | **3.11 or 3.12** (3.13+ won't work because of the pinned numpy version) | https://www.python.org/downloads/ |
| Node.js | **20 LTS or 22 LTS** | https://nodejs.org/ |
| MySQL Server | 8.x | https://dev.mysql.com/downloads/mysql/ (Windows: use the "MySQL Installer") |
| Expo Go app (on your phone) | must support **Expo SDK 54** | Play Store / App Store, see step 6 |

When you install them:

- **Python on Windows:** tick **"Add python.exe to PATH"** on the first installer screen.
- **MySQL:** write down the **root password** you set during install. You'll need it in step 3.

Check that everything is installed. Open a new terminal and run:

```bash
git --version
python --version     # macOS/Linux: python3 --version
node --version
npm --version
mysql --version      # it's fine if this one isn't on PATH, as long as the MySQL service is running
```

You also need a **Google Gemini API key** for the AI features (chat, prescription scan, AI insights, PDF summary). It's free: https://aistudio.google.com/apikey. Without a key, login, onboarding, the risk score, and the cost estimator still work. The AI features don't.

---

## 1. Get The Code

```bash
git clone https://github.com/darshil-sisodiya/Eunoia-Health-AI.git
cd Eunoia-Health-AI
```

Run every command below from this `Eunoia-Health-AI` folder unless a step says otherwise.

---

## 2. Make Sure MySQL Is Running

- **Windows:** press `Win + R`, type `services.msc`, find **MySQL80**, and check it says *Running*. If it doesn't, right-click it and choose *Start*.
- **macOS (Homebrew):** `brew services start mysql`
- **Linux:** `sudo systemctl start mysql`

You **don't** need to create the database or any tables. The backend creates the `health_assistant` database and all of its tables the first time it starts.

---

## 3. Configure The Backend

Copy the example env file:

```powershell
# Windows (PowerShell)
Copy-Item backend\.env.example backend\.env
notepad backend\.env
```

```bash
# macOS / Linux
cp backend/.env.example backend/.env
nano backend/.env
```

Edit these lines and leave the rest as they are:

```env
MYSQL_USER=root
MYSQL_PASSWORD=<the MySQL root password you set during install>

JWT_SECRET=<any long random string, e.g. mash the keyboard for 40 characters>

GEMINI_API_KEY=<your key from aistudio.google.com/apikey>
GEMINI_MODEL=gemini-2.5-flash
```

Save the file. Never commit `backend/.env`. It's already in `.gitignore`.

---

## 4. Install And Start The Backend

Open a terminal in the project folder.

### Windows (PowerShell)

```powershell
cd backend
py -3.11 -m venv venv          # or: python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python server.py
```

> If `Activate.ps1` fails with *"running scripts is disabled on this system"*, run this once, then try again:
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

### macOS / Linux

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python server.py
```

`pip install` takes a few minutes the first time.

### Check that it works

The terminal should show `Uvicorn running on http://0.0.0.0:8000`. Open this link in a browser:

http://localhost:8000/api/health

You should see something like `{"status":"healthy", ...}`. Leave this terminal open, because the backend has to keep running.

**Next time** you only need to run:

```powershell
cd backend
.\venv\Scripts\Activate.ps1    # macOS/Linux: source venv/bin/activate
python server.py
```

On Windows, `.\run.ps1` inside `backend` does the same thing.

---

## 5. Install And Start The Frontend

Open a **second** terminal in the project folder:

```bash
cd frontend
npm install
npx expo start
```

If `npm install` fails with an `ERESOLVE` peer-dependency error, run `npm install --legacy-peer-deps` instead.

You **don't** need a `frontend/.env` for local development. The app works out which computer is running Expo and connects to the backend on port `8000` of that same computer. Only create one (`cp frontend/.env.example frontend/.env`) if you want to point the app at a backend on another machine, such as a deployed server.

---

## 6. Open The App

Once `npx expo start` is running, it prints a QR code. Pick one of these options.

### Option A: Your phone (easiest)

1. Install **Expo Go** from the Play Store or App Store.
2. Connect your phone and your computer to the **same Wi-Fi network**.
3. Android: scan the QR code in the Expo Go app. iPhone: scan it with the Camera app.

If Expo Go says the project is **incompatible / needs a different SDK version**, your Expo Go is newer than SDK 54. Install the SDK 54 build of Expo Go from https://expo.dev/go, or use Option B or C.

### Option B: Android emulator

1. Install Android Studio and create a virtual device (Device Manager → *Create device*).
2. Start the emulator.
3. Press `a` in the Expo terminal.

### Option C: Web browser (quick look)

Press `w` in the Expo terminal, or run `npm run web`. Most screens work. The camera and step counter only work on a real phone.

---

## 7. Try It Out

1. **Register** a new account.
2. Complete the **onboarding** (basic info → lifestyle → medical → family → location).
3. The **home screen** should show your wellness score.
4. Open the risk report, try the **cost estimator**, and (if you set a Gemini key) try **chat** and the **prescription scan**.
5. Go to **Profile → generate PDF report**.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| App says *Network Error* / can't reach the backend | Check that the backend terminal is still running. Make sure your phone and PC are on the **same Wi-Fi** (guest networks and college networks often block device-to-device traffic, so try a phone hotspot instead). On Windows, allow **Python** through the firewall on *Private* networks when Windows asks, or turn off Windows Firewall for a moment to test. |
| Backend: `Access denied for user 'root'` | `MYSQL_USER` / `MYSQL_PASSWORD` in `backend/.env` are wrong. |
| Backend: `Can't connect to MySQL server` | The MySQL service isn't running. See step 2. |
| `pip install` fails building numpy/pandas | You're on Python 3.13+. Install Python 3.11, delete the `backend/venv` folder, and redo step 4 with `py -3.11 -m venv venv`. |
| `'python' is not recognized` (Windows) | Use `py` instead of `python`, or reinstall Python with "Add to PATH" ticked. |
| AI features return errors | Check `GEMINI_API_KEY` and `GEMINI_MODEL=gemini-2.5-flash` in `backend/.env`, then **restart the backend**. |
| App still uses old settings after editing `.env` | Restart Expo with a cleared cache: `npx expo start -c` |
| Port 8000 already in use | Stop the other process, or run the backend on another port: set `PORT=8001` in `backend/.env` **and** `EXPO_PUBLIC_BACKEND_PORT=8001` in `frontend/.env`. |

## Running The Tests (optional)

```powershell
cd backend
.\venv\Scripts\Activate.ps1    # macOS/Linux: source venv/bin/activate
pytest
```
