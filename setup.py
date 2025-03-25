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
    requirements_path = Path("backend/requirements.txt")
    if not requirements_path.exists():
        print("Error: requirements.txt not found")
        sys.exit(1)
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(requirements_path)])

def create_env_file():
    env_path = Path("backend/.env")
    if not env_path.exists():
        api_key = input("Enter your Gemini API key: ").strip()
        env_path.parent.mkdir(parents=True, exist_ok=True)
        with open(env_path, "w") as f:
            f.write(f"GOOGLE_API_KEY={api_key}\n")
        print("Created .env file with your API key")
    else:
        print(".env file already exists")

def generate_icons():
    print("Generating extension icons...")
    icons_script = Path("generate_icons.py")
    if not icons_script.exists():
        print("Error: generate_icons.py not found")
        sys.exit(1)
    subprocess.check_call([sys.executable, str(icons_script)])

def check_directory_structure():
    required_dirs = [
        Path("extension/popup"),
        Path("extension/background"),
        Path("extension/content"),
        Path("extension/icons"),
        Path("backend/services")
    ]
    
    for dir_path in required_dirs:
        dir_path.mkdir(parents=True, exist_ok=True)
        print(f"Verified directory: {dir_path}")

def main():
    print("Setting up Gemini Assistant Extension...")
    
    try:
        # Check Python version
        check_python_version()
        
        # Ensure directory structure exists
        check_directory_structure()
        
        # Install requirements
        install_requirements()
        
        # Create .env file if needed
        create_env_file()
        
        # Generate icons
        generate_icons()
        
        print("\nSetup completed successfully!")
        print("\nTo start the extension:")
        print("1. Start the backend server:")
        print("   cd backend")
        print("   python services/app.py")
        print("\n2. Load the extension in Chrome:")
        print("   - Open chrome://extensions/")
        print("   - Enable 'Developer mode'")
        print("   - Click 'Load unpacked'")
        print("   - Select the 'extension' folder")
        
    except subprocess.CalledProcessError as e:
        print(f"Error during setup: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 