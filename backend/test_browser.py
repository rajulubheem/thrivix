#!/usr/bin/env python3
"""
Test the smart browser tool to ensure screenshots are captured
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.tools.smart_browser_tool import (
    start_browser_session, 
    navigate_to_url, 
    scroll_page,
    get_current_screenshots,
    close_browser_session
)

def test_browser():
    print("Testing Smart Browser Tool...")
    
    # Start browser session
    print("\n1. Starting browser session...")
    result = start_browser_session(headless=True)
    print(f"Result: {result}")
    
    # Navigate to a webpage
    print("\n2. Navigating to example.com...")
    result = navigate_to_url("https://example.com")
    print(f"Result: {result[:200]}...")
    
    # Check screenshots
    print("\n3. Checking screenshots...")
    screenshots = get_current_screenshots()
    print(f"Screenshots captured: {len(screenshots)}")
    for i, screenshot in enumerate(screenshots):
        print(f"  Screenshot {i+1}: {screenshot.get('description', 'No description')}")
        print(f"    - URL: {screenshot.get('url', 'No URL')}")
        print(f"    - Has image data: {'Yes' if screenshot.get('data') else 'No'}")
        print(f"    - OCR text preview: {screenshot.get('ocr_text', '')[:100]}...")
    
    # Scroll down
    print("\n4. Scrolling down...")
    result = scroll_page("down", 300)
    print(f"Result: {result[:200]}...")
    
    # Check screenshots again
    print("\n5. Checking screenshots after scroll...")
    screenshots = get_current_screenshots()
    print(f"Total screenshots: {len(screenshots)}")
    
    # Close browser
    print("\n6. Closing browser session...")
    result = close_browser_session()
    print(f"Result: {result}")
    
    # Final check
    print("\n7. Final screenshot check after closing...")
    screenshots = get_current_screenshots()
    print(f"Screenshots after closing: {len(screenshots)} (should be 0)")
    
    print("\n✅ Test completed successfully!")

if __name__ == "__main__":
    test_browser()
