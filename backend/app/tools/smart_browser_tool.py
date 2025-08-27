"""
Smart Browser Tool with Real-time Screenshot Streaming
This tool provides real web browsing with visibility for users
"""

import base64
import json
import os
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright, Page, Browser
from strands import tool
import structlog
import pytesseract
from PIL import Image
import io
import time

logger = structlog.get_logger()

# Create screenshots directory
SCREENSHOTS_DIR = Path("./browser_screenshots")
SCREENSHOTS_DIR.mkdir(exist_ok=True)

# Global storage for current browsing session
_current_session = {
    "browser": None,
    "playwright": None,
    "page": None,
    "context": None,
    "screenshots": [],
    "current_url": None
}


def capture_screenshot_with_ocr(page: Page, description: str) -> Dict[str, Any]:
    """Capture screenshot and extract text using OCR"""
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:17]
        screenshot_path = SCREENSHOTS_DIR / f"browse_{timestamp}.png"
        
        # Take screenshot
        screenshot_bytes = page.screenshot(path=str(screenshot_path))
        screenshot_b64 = base64.b64encode(screenshot_bytes).decode('utf-8')
        
        # Extract text using OCR
        try:
            image = Image.open(io.BytesIO(screenshot_bytes))
            ocr_text = pytesseract.image_to_string(image)
            ocr_text = ' '.join(ocr_text.split())[:2000]  # Clean and limit
        except Exception as e:
            logger.error(f"OCR failed: {e}")
            ocr_text = ""
        
        screenshot_data = {
            'timestamp': timestamp,
            'path': str(screenshot_path),
            'description': description,
            'url': page.url,
            'title': page.title(),
            'ocr_text': ocr_text,
            'data': f"data:image/png;base64,{screenshot_b64}"
        }
        
        # Store in session
        _current_session["screenshots"].append(screenshot_data)
        
        logger.info(f"📸 Screenshot captured: {description}")
        return screenshot_data
        
    except Exception as e:
        logger.error(f"Screenshot capture failed: {e}")
        return {}


@tool
def start_browser_session(headless: bool = True) -> str:
    """Start a new browser session that stays open for multiple operations.
    
    This creates a persistent browser that can be used for multiple navigation steps,
    allowing users to see a continuous browsing experience.
    
    Args:
        headless: If True, runs in headless mode (for cloud). If False, shows browser window.
        
    Returns:
        Status message with session info
    """
    global _current_session
    
    # Check if session already exists
    if _current_session["browser"] is not None:
        logger.warning("Browser session already exists. Using existing session.")
        return "Browser session already active. You can navigate to websites now."
    
    # Close any stale session
    if _current_session["browser"] or _current_session["playwright"]:
        try:
            close_browser_session()
        except:
            pass
    
    try:
        playwright = sync_playwright().start()
        browser = playwright.chromium.launch(
            headless=headless,
            args=[
                '--window-size=1600,900',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        )
        
        context = browser.new_context(
            viewport={'width': 1600, 'height': 900},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        
        page = context.new_page()
        
        # Store in session
        _current_session.update({
            "browser": browser,
            "playwright": playwright,
            "page": page,
            "context": context,
            "screenshots": [],
            "current_url": None
        })
        
        logger.info(f"🌐 Browser session started ({'headless' if headless else 'visible'} mode)")
        return f"Browser session started successfully in {'headless' if headless else 'visible'} mode. Ready to navigate to websites."
        
    except Exception as e:
        logger.error(f"Failed to start browser: {e}")
        return f"Error starting browser: {str(e)}"


@tool
def navigate_to_url(url: str) -> str:
    """Navigate to a specific URL in the current browser session.
    
    Args:
        url: The URL to navigate to
        
    Returns:
        Description of what's visible on the page with screenshot
    """
    global _current_session
    
    if not _current_session["page"]:
        return "No browser session active. Please call start_browser_session first."
    
    try:
        page = _current_session["page"]
        
        # Navigate to URL
        logger.info(f"🔗 Navigating to: {url}")
        page.goto(url, wait_until='domcontentloaded', timeout=30000)
        time.sleep(2)  # Wait for content to load
        
        _current_session["current_url"] = url
        
        # Handle cookie banners
        try:
            cookie_selectors = [
                'button:has-text("Accept")',
                'button:has-text("Accept All")',
                'button:has-text("OK")',
                'button:has-text("I agree")',
                '[id*="accept"]'
            ]
            
            for selector in cookie_selectors:
                try:
                    if page.locator(selector).first.is_visible(timeout=1000):
                        page.locator(selector).first.click()
                        logger.info("🍪 Accepted cookies")
                        time.sleep(1)
                        break
                except:
                    continue
        except:
            pass
        
        # Capture initial screenshot
        screenshot = capture_screenshot_with_ocr(page, f"Initial view of {url}")
        
        # Get page info
        title = page.title()
        
        response = f"""
🌐 **Navigated to: {url}**

**Page Title:** {title}

**Screenshot captured:** Yes
**Visible Content (via OCR):**
{screenshot.get('ocr_text', 'No text extracted')[:500]}...

**What I can see:**
- Page has loaded successfully
- Screenshot shows the current view
- Ready to interact with the page (scroll, click, search, etc.)

**Screenshot available for viewing in chat**
"""
        
        return response
        
    except Exception as e:
        logger.error(f"Navigation failed: {e}")
        return f"Error navigating to {url}: {str(e)}"


@tool
def scroll_page(direction: str = "down", amount: int = 500) -> str:
    """Scroll the current page to see more content.
    
    Args:
        direction: "down" or "up"
        amount: Pixels to scroll (default 500)
        
    Returns:
        Description of new visible content with screenshot
    """
    global _current_session
    
    if not _current_session["page"]:
        return "No browser session active. Please call start_browser_session first."
    
    try:
        page = _current_session["page"]
        
        # Scroll
        if direction == "down":
            page.evaluate(f"window.scrollBy(0, {amount})")
        else:
            page.evaluate(f"window.scrollBy(0, -{amount})")
        
        time.sleep(2)  # Wait for any lazy-loaded content to appear
        
        # Capture screenshot
        screenshot = capture_screenshot_with_ocr(
            page, 
            f"After scrolling {direction} {amount}px"
        )
        
        response = f"""
📜 **Scrolled {direction} by {amount}px**

**New Visible Content (via OCR):**
{screenshot.get('ocr_text', 'No text extracted')[:500]}...

**Screenshot captured:** Showing new section of the page
**Ready for next action:** Can continue scrolling, clicking, or navigating

**Screenshot available for viewing in chat**
"""
        
        return response
        
    except Exception as e:
        logger.error(f"Scroll failed: {e}")
        return f"Error scrolling: {str(e)}"


@tool
def search_on_page(search_text: str) -> str:
    """Search for text on the current page and interact with search boxes.
    
    Args:
        search_text: Text to search for or enter in search box
        
    Returns:
        Result of search with screenshot
    """
    global _current_session
    
    if not _current_session["page"]:
        return "No browser session active. Please call start_browser_session first."
    
    try:
        page = _current_session["page"]
        
        # Try to find search input
        search_selectors = [
            'input[type="search"]',
            'input[placeholder*="search" i]',
            'input[placeholder*="Search" i]',
            'input[name*="search" i]',
            'input[name="q"]',
            'input.search',
            '#search'
        ]
        
        search_found = False
        for selector in search_selectors:
            try:
                if page.locator(selector).first.is_visible(timeout=1000):
                    page.locator(selector).first.fill(search_text)
                    page.locator(selector).first.press("Enter")
                    search_found = True
                    logger.info(f"🔍 Searched for: {search_text}")
                    time.sleep(2)  # Wait for results
                    break
            except:
                continue
        
        if not search_found:
            # Try Ctrl+F browser search
            page.keyboard.press("Control+F")
            page.keyboard.type(search_text)
            logger.info(f"🔍 Browser search for: {search_text}")
        
        # Capture screenshot
        screenshot = capture_screenshot_with_ocr(
            page, 
            f"Search results for '{search_text}'"
        )
        
        response = f"""
🔍 **Searched for: "{search_text}"**

**Search Results (via OCR):**
{screenshot.get('ocr_text', 'No text extracted')[:500]}...

**Screenshot captured:** Shows search results or highlighted text
**Ready for next action:** Can click on results, continue searching, or navigate

**Screenshot available for viewing in chat**
"""
        
        return response
        
    except Exception as e:
        logger.error(f"Search failed: {e}")
        return f"Error searching: {str(e)}"


@tool
def click_element(element_text: str) -> str:
    """Click on an element containing specific text.
    
    Args:
        element_text: Text of the element to click (link, button, etc.)
        
    Returns:
        Result of click action with screenshot
    """
    global _current_session
    
    if not _current_session["page"]:
        return "No browser session active. Please call start_browser_session first."
    
    try:
        page = _current_session["page"]
        
        # Try to click element with text
        clicked = False
        try:
            element = page.get_by_text(element_text).first
            if element.is_visible(timeout=2000):
                element.click()
                clicked = True
                logger.info(f"👆 Clicked on: {element_text}")
                time.sleep(2)  # Wait for navigation/action
        except:
            pass
        
        if not clicked:
            # Try link with text
            try:
                link = page.get_by_role("link", name=element_text).first
                if link.is_visible(timeout=1000):
                    link.click()
                    clicked = True
                    logger.info(f"🔗 Clicked link: {element_text}")
                    time.sleep(2)
            except:
                pass
        
        # Capture screenshot
        screenshot = capture_screenshot_with_ocr(
            page, 
            f"After clicking '{element_text}'"
        )
        
        if clicked:
            response = f"""
👆 **Clicked on: "{element_text}"**

**New Page/Content (via OCR):**
{screenshot.get('ocr_text', 'No text extracted')[:500]}...

**Current URL:** {page.url}
**Screenshot captured:** Shows result of click action
**Ready for next action:** Can continue browsing

**Screenshot available for viewing in chat**
"""
        else:
            response = f"""
❌ **Could not find clickable element with text: "{element_text}"**

**Current visible content still shows:**
{screenshot.get('ocr_text', 'No text extracted')[:300]}...

**Try:** Scrolling to find the element, or use different text
"""
        
        return response
        
    except Exception as e:
        logger.error(f"Click failed: {e}")
        return f"Error clicking: {str(e)}"


@tool
def get_browsing_summary() -> str:
    """Get a summary of the current browsing session with all screenshots.
    
    Returns:
        Summary of browsing session with screenshot count and data
    """
    global _current_session
    
    if not _current_session["screenshots"]:
        return "No browsing session active or no screenshots captured yet."
    
    screenshots = _current_session["screenshots"]
    current_url = _current_session["current_url"]
    
    response = f"""
📊 **Browsing Session Summary**

**Current URL:** {current_url}
**Screenshots Captured:** {len(screenshots)}

**Journey:**
"""
    
    for i, screenshot in enumerate(screenshots, 1):
        response += f"""
{i}. **{screenshot['description']}**
   - URL: {screenshot['url']}
   - Time: {screenshot['timestamp']}
   - Text Preview: {screenshot.get('ocr_text', '')[:100]}...
"""
    
    response += f"""

**All {len(screenshots)} screenshots are available for viewing in the chat interface**
"""
    
    return response


@tool
def close_browser_session() -> str:
    """Close the current browser session.
    
    Returns:
        Closing status with session summary
    """
    global _current_session
    
    screenshot_count = len(_current_session["screenshots"])
    # Store screenshots before clearing (they'll be retrieved one last time by the API)
    screenshots_to_preserve = _current_session["screenshots"].copy()
    
    try:
        if _current_session["page"]:
            try:
                _current_session["page"].close()
            except Exception as e:
                logger.warning(f"Failed to close page: {e}")
        if _current_session["context"]:
            try:
                _current_session["context"].close()
            except Exception as e:
                logger.warning(f"Failed to close context: {e}")
        if _current_session["browser"]:
            try:
                _current_session["browser"].close()
            except Exception as e:
                logger.warning(f"Failed to close browser: {e}")
        if _current_session["playwright"]:
            try:
                _current_session["playwright"].stop()
            except Exception as e:
                logger.warning(f"Failed to stop playwright: {e}")
    except Exception as e:
        logger.error(f"Unexpected error closing browser: {e}")
    
    # Reset session but keep screenshots temporarily for final retrieval
    _current_session = {
        "browser": None,
        "playwright": None,
        "page": None,
        "context": None,
        "screenshots": screenshots_to_preserve,  # Keep screenshots for final retrieval
        "current_url": None
    }
    
    return f"Browser session closed. Captured {screenshot_count} screenshots during the session."


# Export function to get current screenshots for the API
def get_current_screenshots() -> List[Dict[str, Any]]:
    """Get all screenshots from current session"""
    return _current_session.get("screenshots", [])