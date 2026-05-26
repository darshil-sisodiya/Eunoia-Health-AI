# Prescription Feature Verification Script
# Run this to check if prescriptions will appear in the PDF

import asyncio
import aiomysql
import os
from dotenv import load_dotenv

load_dotenv()

MYSQL_HOST = os.environ.get('MYSQL_HOST', 'localhost')
MYSQL_PORT = int(os.environ.get('MYSQL_PORT', '3306'))
MYSQL_DB = os.environ.get('MYSQL_DB', 'health_assistant')
MYSQL_USER = os.environ.get('MYSQL_USER', 'root')
MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD', '')

async def check_prescriptions():
    print("=" * 60)
    print("PRESCRIPTION FEATURE VERIFICATION")
    print("=" * 60)
    
    try:
        # Connect to databaseCline
        conn = await aiomysql.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            db=MYSQL_DB,
        )
        print("✅ Database connection successful")
        
        async with conn.cursor(aiomysql.DictCursor) as cur:
            # Check users
            await cur.execute("SELECT COUNT(*) as count FROM users")
            result = await cur.fetchone()
            user_count = result['count']
            print(f"✅ Users in database: {user_count}")
            
            if user_count == 0:
                print("❌ No users found! Create a user first.")
                conn.close()
                return
            
            # Check prescriptions
            await cur.execute("SELECT COUNT(*) as count FROM prescriptions")
            result = await cur.fetchone()
            pres_count = result['count']
            print(f"{'✅' if pres_count > 0 else '❌'} Prescriptions in database: {pres_count}")
            
            if pres_count == 0:
                print("❌ NO PRESCRIPTIONS FOUND!")
                print("   You need to upload at least one prescription for the PDF to show them.")
                print("   Upload via: Mobile App > Prescriptions tab > Upload prescription image")
                conn.close()
                return
            
            # Get prescription details
            await cur.execute("""
                SELECT 
                    p.id,
                    u.username,
                    p.medication_name,
                    p.dosage,
                    p.frequency,
                    p.created_at
                FROM prescriptions p
                JOIN users u ON p.user_id = u.id
                ORDER BY p.created_at DESC
                LIMIT 5
            """)
            prescriptions = await cur.fetchall()
            
            print("\n" + "=" * 60)
            print("RECENT PRESCRIPTIONS (will appear in PDF):")
            print("=" * 60)
            
            for idx, p in enumerate(prescriptions, 1):
                print(f"\n{idx}. User: {p['username']}")
                print(f"   Medication: {p['medication_name']}")
                print(f"   Dosage: {p['dosage'] or 'Not specified'}")
                print(f"   Frequency: {p['frequency'] or 'Not specified'}")
                print(f"   Added: {p['created_at']}")
            
            print("\n" + "=" * 60)
            print("PDF REPORT VERIFICATION:")
            print("=" * 60)
            
            # Check if pdf_generator has prescriptions parameter
            try:
                from pdf_generator import create_health_report_pdf
                import inspect
                sig = inspect.signature(create_health_report_pdf)
                params = list(sig.parameters.keys())
                
                has_prescriptions = 'prescriptions' in params
                has_prescription_summary = 'prescription_ai_summary' in params
                
                print(f"{'✅' if has_prescriptions else '❌'} pdf_generator.py has 'prescriptions' parameter: {has_prescriptions}")
                print(f"{'✅' if has_prescription_summary else '❌'} pdf_generator.py has 'prescription_ai_summary' parameter: {has_prescription_summary}")
                
                if not has_prescriptions or not has_prescription_summary:
                    print("❌ PDF generator is missing prescription parameters!")
                    print("   The function signature should include:")
                    print("   create_health_report_pdf(..., prescriptions=None, prescription_ai_summary=None)")
                
            except Exception as e:
                print(f"⚠️  Could not verify pdf_generator.py: {e}")
            
            print("\n" + "=" * 60)
            print("NEXT STEPS:")
            print("=" * 60)
            
            if pres_count > 0:
                print("✅ You have prescriptions in the database")
                print("✅ They WILL appear in the PDF report")
                print("\nTo test:")
                print("1. Start backend: uvicorn server:app --reload")
                print("2. Open mobile app > Insights tab")
                print("3. Tap 'Open Health Report (PDF)'")
                print("4. Look for 'Prescriptions & Medication Analysis' section")
            else:
                print("❌ Upload at least 1 prescription first")
                print("   Use: Mobile App > Prescriptions tab")
            
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        print("\nTroubleshooting:")
        print("- Check .env file has correct database credentials")
        print("- Ensure MySQL is running")
        print("- Verify database 'health_assistant' exists")

if __name__ == "__main__":
    asyncio.run(check_prescriptions())
