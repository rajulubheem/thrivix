"""
Reliable Browser Tool - Simple and effective web browsing
"""

import base64
import os
import time
from typing import Dict, Any, List
from datetime import datetime
from pathlib import Path
from strands import tool
import structlog
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException, WebDriverException
import tempfile

logger = structlog.get_logger()

# Create screenshots directory
SCREENSHOTS_DIR = Path("./browser_screenshots")
SCREENSHOTS_DIR.mkdir(exist_ok=True)

# Global storage for screenshots
_screenshots_collection = []

def setup_chrome_driver():
    """Setup Chrome driver with proper options"""
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1600,900")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
    
    # Try to create driver
    try:
        driver = webdriver.Chrome(options=chrome_options)
        return driver
    except Exception as e:
        logger.error(f"Failed to create Chrome driver: {e}")
        # Try with Safari as fallback on Mac
        try:
            driver = webdriver.Safari()
            return driver
        except:
            pass
        raise Exception("No browser driver available")


@tool
def capture_website(url: str) -> str:
    """Capture screenshots of a website with scrolling.
    
    Args:
        url: The URL to capture
        
    Returns:
        Description of what was captured
    """
    driver = None
    screenshots_captured = []
    
    try:
        logger.info(f"🌐 Opening browser for: {url}")
        driver = setup_chrome_driver()
        
        # Navigate to URL
        driver.get(url)
        time.sleep(3)  # Wait for page to load
        
        # Capture initial screenshot
        timestamp1 = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:17]
        screenshot_path1 = SCREENSHOTS_DIR / f"capture_{timestamp1}.png"
        driver.save_screenshot(str(screenshot_path1))
        
        # Convert to base64
        with open(screenshot_path1, 'rb') as f:
            screenshot_b64_1 = base64.b64encode(f.read()).decode('utf-8')
        
        # Get page text
        try:
            body_text = driver.find_element(By.TAG_NAME, "body").text[:2000]
        except:
            body_text = "Could not extract text"
        
        screenshot1 = {
            'timestamp': timestamp1,
            'path': str(screenshot_path1),
            'description': f"Initial view of {url}",
            'url': url,
            'ocr_text': body_text,
            'data': f"data:image/png;base64,{screenshot_b64_1}",
            'type': 'screenshot'
        }
        
        _screenshots_collection.append(screenshot1)
        screenshots_captured.append(screenshot1)
        logger.info(f"📸 Captured initial view")
        
        # Scroll and capture again
        driver.execute_script("window.scrollBy(0, 600)")
        time.sleep(2)
        
        timestamp2 = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:17]
        screenshot_path2 = SCREENSHOTS_DIR / f"capture_{timestamp2}.png"
        driver.save_screenshot(str(screenshot_path2))
        
        with open(screenshot_path2, 'rb') as f:
            screenshot_b64_2 = base64.b64encode(f.read()).decode('utf-8')
        
        # Get scrolled text
        try:
            scrolled_text = driver.find_element(By.TAG_NAME, "body").text[500:2500]
        except:
            scrolled_text = body_text[500:] if len(body_text) > 500 else body_text
        
        screenshot2 = {
            'timestamp': timestamp2,
            'path': str(screenshot_path2),
            'description': f"Scrolled view of {url}",
            'url': url,
            'ocr_text': scrolled_text,
            'data': f"data:image/png;base64,{screenshot_b64_2}",
            'type': 'screenshot'
        }
        
        _screenshots_collection.append(screenshot2)
        screenshots_captured.append(screenshot2)
        logger.info(f"📸 Captured scrolled view")
        
        # Build response
        response = f"""
🌐 **Successfully browsed: {url}**

📸 **Screenshots captured: {len(screenshots_captured)}**
- Initial view of the webpage
- Scrolled view showing more content

**Page title:** {driver.title}

**Visible content preview:**
{body_text[:500]}...

**Status:** Successfully captured and ready for viewing
**Note:** Screenshots are displayed in the gallery below the conversation
"""
        
        return response
        
    except Exception as e:
        logger.error(f"Error browsing {url}: {e}")
        return f"Failed to browse {url}: {str(e)}"
        
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass


@tool
def capture_multiple_websites(urls: List[str]) -> str:
    """Capture screenshots from multiple websites.
    
    Args:
        urls: List of URLs to capture
        
    Returns:
        Summary of captures
    """
    results = []
    total_screenshots = 0
    
    for i, url in enumerate(urls[:4], 1):  # Limit to 4 sites
        logger.info(f"🌐 Processing site {i}/{min(len(urls), 4)}: {url}")
        
        result = capture_website(url)
        
        if "Successfully" in result:
            results.append(f"✅ {url}")
            total_screenshots += 2  # Each site gets 2 screenshots
        else:
            results.append(f"❌ {url} - Failed")
        
        time.sleep(2)  # Delay between sites
    
    response = f"""
🌐 **Browsed {len(results)} websites**

📸 **Total screenshots captured: {total_screenshots}**

**Sites processed:**
"""
    for result in results:
        response += f"\n- {result}"
    
    response += """

**Note:** All screenshots are displayed in the gallery below the conversation.
Click any screenshot to view it in full size.
"""
    
    return response


def get_all_screenshots() -> List[Dict[str, Any]]:
    """Get all captured screenshots"""
    return _screenshots_collection.copy()


def clear_screenshot_cache():
    """Clear the screenshots cache"""
    global _screenshots_collection
    _screenshots_collection = []