#!/usr/bin/env python3
"""Test script to verify the improved HTML export functionality"""

import requests
import json
import os
import tempfile
import zipfile
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8000"
API_PREFIX = "/api/v1"

def test_html_export():
    """Test the HTML export functionality with sample data"""
    
    # Create a test session ID
    session_id = f"test_session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    print(f"Testing HTML export for session: {session_id}")
    
    # Test the export endpoint
    export_url = f"{BASE_URL}{API_PREFIX}/streaming/sessions/{session_id}/export"
    
    try:
        # Make the export request
        response = requests.get(export_url)
        
        if response.status_code == 200:
            print("✓ Export endpoint responded successfully")
            
            # Save the ZIP file
            temp_dir = tempfile.mkdtemp()
            zip_path = os.path.join(temp_dir, f"{session_id}.zip")
            
            with open(zip_path, 'wb') as f:
                f.write(response.content)
            
            print(f"✓ ZIP file saved to: {zip_path}")
            
            # Extract and examine the contents
            with zipfile.ZipFile(zip_path, 'r') as zf:
                files = zf.namelist()
                print(f"✓ ZIP contains {len(files)} files: {files}")
                
                # Extract HTML report
                if 'report.html' in files:
                    html_content = zf.read('report.html').decode('utf-8')
                    
                    # Save HTML for manual inspection
                    html_path = os.path.join(temp_dir, 'report.html')
                    with open(html_path, 'w', encoding='utf-8') as f:
                        f.write(html_content)
                    
                    print(f"✓ HTML report extracted to: {html_path}")
                    
                    # Check for key elements in the HTML
                    checks = [
                        ("Modern CSS variables", ":root {" in html_content),
                        ("Gradient background", "linear-gradient" in html_content),
                        ("Stats grid", "stats-grid" in html_content),
                        ("Responsive design", "@media" in html_content),
                        ("Enhanced cards", "class=\"card\"" in html_content),
                        ("Agent chips", "agent-chips" in html_content or "chip" in html_content),
                        ("Message bubbles", "message-bubble" in html_content),
                        ("Code blocks", "code-block" in html_content),
                        ("Custom scrollbar", "::-webkit-scrollbar" in html_content),
                    ]
                    
                    print("\nHTML Quality Checks:")
                    for check_name, check_result in checks:
                        status = "✓" if check_result else "✗"
                        print(f"  {status} {check_name}")
                    
                    # Print file size
                    size_kb = len(html_content) / 1024
                    print(f"\n✓ HTML size: {size_kb:.2f} KB")
                    
                    # Open in browser for manual inspection (optional)
                    print(f"\nTo view the report, open: file://{html_path}")
                    
                else:
                    print("✗ report.html not found in ZIP")
            
        else:
            print(f"✗ Export failed with status {response.status_code}")
            print(f"Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("✗ Could not connect to the API. Make sure the backend is running on port 8000")
    except Exception as e:
        print(f"✗ Test failed with error: {e}")

if __name__ == "__main__":
    test_html_export()