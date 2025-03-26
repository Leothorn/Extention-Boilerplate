import requests
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import os
import json
import time

def create_test_pdf(filename, content):
    """Create a test PDF file with sample content"""
    c = canvas.Canvas(filename, pagesize=letter)
    c.drawString(100, 750, content)
    c.save()

def test_multiple_pdfs():
    """Test the multiple PDF processing endpoint"""
    # Create test PDFs with their prompts
    test_files = [
        ("test1.pdf", "This is test PDF 1 with some sample content.", "Give me a detailed summary of this document."),
        ("test2.pdf", "This is test PDF 2 with different content.", "What are the key points in this document?"),
        ("test3.pdf", "This is test PDF 3 with more content.", "Analyze this document and provide insights.")
    ]
    
    # Create the PDFs
    for filename, content, _ in test_files:
        create_test_pdf(filename, content)
    
    try:
        # Prepare the files and prompts for upload
        files = []
        prompts = {}
        
        for filename, _, prompt in test_files:
            file_id = f"test_{filename}"  # Create a test file ID
            files.append(('files', (filename, open(filename, 'rb'), 'application/pdf')))
            prompts[file_id] = prompt
        
        # Create form data with files and prompts
        form_data = {
            'prompts': json.dumps(prompts)
        }
        
        # Send request to the endpoint
        print("Sending request to process multiple PDFs...")
        print(f"Prompts being sent: {prompts}")
        
        response = requests.post(
            'http://localhost:5001/process-multiple-pdfs',
            files=files,
            data=form_data
        )
        
        # Print response
        print(f"Status Code: {response.status_code}")
        print("Response:")
        print(json.dumps(response.json(), indent=2))
        
        # Validate response structure
        data = response.json()
        assert 'success' in data, "Response missing 'success' field"
        assert 'results' in data, "Response missing 'results' field"
        
        # Check each result
        for result in data['results']:
            assert 'success' in result, "Result missing 'success' field"
            if result['success']:
                assert 'response' in result, "Successful result missing 'response' field"
                assert 'prompt' in result, "Successful result missing 'prompt' field"
            else:
                assert 'error' in result, "Failed result missing 'error' field"
        
    except Exception as e:
        print(f"Error: {str(e)}")
        raise
    finally:
        # Clean up test files
        for filename, _, _ in test_files:
            if os.path.exists(filename):
                os.remove(filename)

if __name__ == "__main__":
    test_multiple_pdfs() 