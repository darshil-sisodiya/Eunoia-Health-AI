# HealthAssistant - Quick Deployment Script
# Run this after setting up Railway

Write-Host "🚀 HealthAssistant Deployment Helper" -ForegroundColor Cyan
Write-Host ""

# Check if in correct directory
if (-not (Test-Path ".\backend") -or -not (Test-Path ".\frontend")) {
    Write-Host "❌ Please run this script from the HealthAssistant root directory" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Pre-deployment Checklist:" -ForegroundColor Yellow
Write-Host "  1. Railway account created? (https://railway.app)"
Write-Host "  2. MySQL database provisioned on Railway?"
Write-Host "  3. Database schema initialized?"
Write-Host "  4. Gemini API key obtained? (https://ai.google.dev)"
Write-Host ""

$confirm = Read-Host "Have you completed the above steps? (y/n)"
if ($confirm -ne "y") {
    Write-Host "❌ Please complete the setup steps first. See DEPLOYMENT_GUIDE.md" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔧 Step 1: Backend Setup" -ForegroundColor Green
Write-Host "  → Go to Railway dashboard"
Write-Host "  → Deploy from GitHub (select 'backend' folder)"
Write-Host "  → Add environment variables (see DEPLOYMENT_GUIDE.md)"
Write-Host ""

$backendUrl = Read-Host "Enter your Railway backend URL (e.g., https://your-app.railway.app)"
if ([string]::IsNullOrWhiteSpace($backendUrl)) {
    Write-Host "❌ Backend URL is required" -ForegroundColor Red
    exit 1
}

# Update frontend .env
Write-Host ""
Write-Host "📱 Step 2: Updating Frontend Configuration" -ForegroundColor Green
$envContent = "# Backend API URL`nEXPO_PUBLIC_BACKEND_URL=$backendUrl`n"
Set-Content -Path ".\frontend\.env" -Value $envContent
Write-Host "  ✅ Updated frontend/.env with backend URL" -ForegroundColor Green

Write-Host ""
Write-Host "🏗️ Step 3: Choose Deployment Method" -ForegroundColor Green
Write-Host "  1. Build APK with EAS (recommended for distribution)"
Write-Host "  2. Publish to Expo Go (quick testing)"
Write-Host "  3. Skip for now"
Write-Host ""

$choice = Read-Host "Select option (1-3)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "📦 Building APK with EAS..." -ForegroundColor Cyan
        Write-Host "  This will take 15-30 minutes."
        Write-Host ""
        
        Set-Location .\frontend
        
        # Check if EAS CLI is installed
        $easInstalled = Get-Command eas -ErrorAction SilentlyContinue
        if (-not $easInstalled) {
            Write-Host "  → Installing EAS CLI..." -ForegroundColor Yellow
            npm install -g eas-cli
        }
        
        Write-Host "  → Logging in to EAS..." -ForegroundColor Yellow
        eas login
        
        Write-Host "  → Starting build..." -ForegroundColor Yellow
        eas build --platform android --profile preview
        
        Set-Location ..
        
        Write-Host ""
        Write-Host "✅ Build started! Check EAS dashboard for progress." -ForegroundColor Green
    }
    "2" {
        Write-Host ""
        Write-Host "📤 Publishing to Expo Go..." -ForegroundColor Cyan
        
        Set-Location .\frontend
        npx expo publish
        Set-Location ..
        
        Write-Host ""
        Write-Host "✅ Published! Users can scan QR code with Expo Go app." -ForegroundColor Green
    }
    "3" {
        Write-Host "  Skipping mobile deployment." -ForegroundColor Yellow
    }
    default {
        Write-Host "❌ Invalid option" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "🎉 Deployment process completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Cyan
Write-Host "  • Test your backend: $backendUrl/health"
Write-Host "  • Check EAS dashboard for APK download"
Write-Host "  • Share APK with users or publish to Play Store"
Write-Host ""
Write-Host "📚 For more details, see DEPLOYMENT_GUIDE.md" -ForegroundColor Yellow
Write-Host ""
