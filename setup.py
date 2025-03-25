import os
import subprocess
import sys
from pathlib import Path

def check_python_version():
    if sys.version_info < (3, 8):
        print("Error: Python 3.8 or higher is required")
        sys.exit(1)

def install_requirements():
    print("Installing Python requirements...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "backend/requirements.txt"])

def create_env_file():
    env_path = Path("backend/.env")
    if not env_path.exists():
        api_key = input("Enter your Gemini API key: ").strip()
        with open(env_path, "w") as f:
            f.write(f"GOOGLE_API_KEY={api_key}\n")
        print("Created .env file with your API key")
    else:
        print(".env file already exists")

def generate_icons():
    print("Generating extension icons...")
    subprocess.check_call([sys.executable, "generate_icons.py"])

def main():
    print("Setting up Gemini Assistant Extension...")
    
    # Check Python version
    check_python_version()
    
    # Install requirements
    install_requirements()
    
    # Create .env file if needed
    create_env_file()
    
    # Generate icons
    generate_icons()
    
    print("\nSetup completed successfully!")
    print("\nTo start the extension:")
    print("1. Start the backend server: cd backend && python services/app.py")
    print("2. Load the extension in Chrome:")
    print("   - Open chrome://extensions/")
    print("   - Enable 'Developer mode'")
    print("   - Click 'Load unpacked'")
    print("   - Select the 'extension' folder")

if __name__ == "__main__":
    main() 