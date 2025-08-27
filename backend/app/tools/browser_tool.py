"""
Browser Automation Tool for Strands Agents
This tool allows agents to open web pages, capture screenshots, and extract content
for detailed analysis. It provides visibility into what the AI is researching.
"""

import asyncio
import base64
import json
import os
from typing import Dict, Any, List, Optional
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright, Page, Browser
from playwright.async_api import async_playwright
from strands import tool
import structlog
import pytesseract
from PIL import Image
import io

logger = structlog.get_logger()

# Create screenshots directory
SCREENSHOTS_DIR = Path("./browser_screenshots")
SCREENSHOTS_DIR.mkdir(exist_ok=True)

# Browser instance (reused across calls for efficiency)
_browser_instance: Optional[Browser] = None
_playwright_instance = None


def extract_text_from_screenshot(screenshot_bytes: bytes) -> str:
    """Extract text from screenshot using OCR"""
    try:
        # Convert bytes to PIL Image
        image = Image.open(io.BytesIO(screenshot_bytes))
        
        # Use Tesseract to extract text
        text = pytesseract.image_to_string(image)
        
        # Clean up the text
        text = ' '.join(text.split())  # Remove excessive whitespace
        
        return text[:3000]  # Limit to 3000 chars to avoid overwhelming the context
    except Exception as e:
        logger.error(f"OCR extraction failed: {e}")
        return ""


def get_browser() -> Browser:
    """Get or create a browser instance - create new one each time to avoid threading issues"""
    try:
        playwright = sync_playwright().start()
        browser = playwright.chromium.launch(
            headless=False,  # Set to False to see the browser
            args=[
                '--window-size=1600,900',
                '--window-position=0,0',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        )
        logger.info("🌐 Browser launched in visible mode")
        return browser, playwright
    except Exception as e:
        logger.error(f"Failed to launch browser: {e}")
        # Fallback to headless mode if visible mode fails
        playwright = sync_playwright().start()
        browser = playwright.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
        logger.info("🌐 Browser launched in headless mode (fallback)")
        return browser, playwright


@tool
def browse_webpage(
    url: str,
    scroll_behavior: str = "full",
    extract_sections: Optional[str] = None,
    capture_screenshot: bool = True
) -> str:
    """Browse a webpage, capture screenshots, and extract detailed content.
    
    This tool opens a real browser window (visible to the user), navigates to the URL,
    scrolls through the page, captures screenshots, and extracts the main content.
    The user can see exactly what the AI is looking at.
    
    Use this tool after finding URLs with tavily_search to get the full page content,
    not just snippets. This provides deep, detailed information from actual web pages.
    
    Args:
        url: The webpage URL to browse
        scroll_behavior: How to scroll - "none", "partial", or "full" (default: "full")
        extract_sections: Comma-separated list of sections to extract (e.g., "introduction,methods,results")
        capture_screenshot: Whether to capture screenshots (default: True)
        
    Returns:
        JSON string with extracted content, analysis, and screenshot paths
    """
    browser = None
    playwright = None
    try:
        logger.info(f"🔍 Opening browser for: {url}")
        
        browser, playwright = get_browser()
        context = browser.new_context(
            viewport={'width': 1600, 'height': 900},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        )
        page = context.new_page()
        
        # Navigate to the page (use domcontentloaded for faster loading)
        page.goto(url, wait_until='domcontentloaded', timeout=30000)
        page.wait_for_timeout(2000)  # Wait for dynamic content
        
        # Handle common cookie consent and popup blockers
        try:
            # Common cookie consent button selectors
            cookie_selectors = [
                'button:has-text("Accept")',
                'button:has-text("Accept All")',
                'button:has-text("Accept all")',
                'button:has-text("Accept cookies")',
                'button:has-text("Allow all")',
                'button:has-text("I agree")',
                'button:has-text("I Accept")',
                'button:has-text("Got it")',
                'button:has-text("OK")',
                '[id*="accept"]',
                '[class*="accept-cookie"]',
                '[class*="cookie-accept"]',
                '[class*="consent-accept"]',
                '[aria-label*="Accept"]',
                '[aria-label*="accept"]',
                '.cookie-consent button.primary',
                '.cookie-banner button.accept',
                '#onetrust-accept-btn-handler',
                '.onetrust-close-btn-handler',
                '[data-testid="cookie-accept"]'
            ]
            
            for selector in cookie_selectors:
                try:
                    cookie_btn = page.locator(selector).first
                    if cookie_btn.is_visible(timeout=1000):
                        cookie_btn.click()
                        logger.info(f"🍪 Accepted cookies with selector: {selector}")
                        page.wait_for_timeout(1000)
                        break
                except:
                    continue
                    
            # Handle newsletter/notification popups
            popup_selectors = [
                'button:has-text("Close")',
                'button:has-text("No thanks")',
                'button:has-text("Not now")',
                'button:has-text("Skip")',
                'button:has-text("Dismiss")',
                '[aria-label="Close"]',
                '[aria-label="close"]',
                '.modal-close',
                '.popup-close',
                '.close-button',
                '[class*="close-modal"]',
                '[class*="dismiss"]'
            ]
            
            for selector in popup_selectors:
                try:
                    popup_btn = page.locator(selector).first
                    if popup_btn.is_visible(timeout=500):
                        popup_btn.click()
                        logger.info(f"❌ Closed popup with selector: {selector}")
                        page.wait_for_timeout(500)
                        break
                except:
                    continue
                    
            # Remove common overlay elements that block content
            overlay_removals = [
                '.cookie-banner',
                '.cookie-consent',
                '.gdpr-banner',
                '.privacy-banner',
                '#cookie-banner',
                '[class*="cookie-policy"]',
                '[class*="newsletter-popup"]',
                '[class*="modal-overlay"]',
                '.overlay',
                '.popup-overlay'
            ]
            
            for selector in overlay_removals:
                try:
                    page.evaluate(f'''
                        document.querySelectorAll('{selector}').forEach(el => el.remove());
                    ''')
                except:
                    continue
                    
            # Scroll page slightly to trigger any lazy-loaded content
            page.evaluate("window.scrollTo(0, 100)")
            page.wait_for_timeout(500)
            page.evaluate("window.scrollTo(0, 0)")
            
        except Exception as e:
            logger.debug(f"Cookie/popup handling: {e}")
            # Continue even if cookie handling fails
        
        # Extract page metadata
        title = page.title()
        
        # Try to extract author and date
        author = None
        pub_date = None
        
        try:
            # Common author selectors
            author_selectors = [
                'meta[name="author"]',
                'meta[property="article:author"]',
                '[class*="author"]',
                '[itemprop="author"]'
            ]
            for selector in author_selectors:
                element = page.query_selector(selector)
                if element:
                    if selector.startswith('meta'):
                        author = element.get_attribute('content')
                    else:
                        author = element.inner_text()
                    if author:
                        break
            
            # Common date selectors
            date_selectors = [
                'meta[property="article:published_time"]',
                'meta[name="publish_date"]',
                'time[datetime]',
                '[class*="date"]',
                '[itemprop="datePublished"]'
            ]
            for selector in date_selectors:
                element = page.query_selector(selector)
                if element:
                    if selector.startswith('meta'):
                        pub_date = element.get_attribute('content')
                    elif selector == 'time[datetime]':
                        pub_date = element.get_attribute('datetime')
                    else:
                        pub_date = element.inner_text()
                    if pub_date:
                        break
        except:
            pass
        
        # Capture initial screenshot
        screenshots = []
        screenshot_data = []
        if capture_screenshot:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            screenshot_path = SCREENSHOTS_DIR / f"page_{timestamp}_initial.png"
            
            # Take screenshot and get base64 data
            screenshot_bytes = page.screenshot(path=str(screenshot_path), full_page=False)
            screenshot_b64 = base64.b64encode(screenshot_bytes).decode('utf-8')
            
            # Extract text using OCR
            ocr_text = extract_text_from_screenshot(screenshot_bytes)
            
            screenshots.append(str(screenshot_path))
            screenshot_data.append({
                'type': 'initial',
                'path': str(screenshot_path),
                'data': f"data:image/png;base64,{screenshot_b64}",
                'description': f"Initial view of {url}",
                'ocr_text': ocr_text,  # Include OCR extracted text
                'timestamp': timestamp
            })
            logger.info(f"📸 Initial screenshot saved with OCR text: {screenshot_path}")
        
        # Wait for content to be visible
        try:
            # Wait for any of the main content selectors to appear
            page.wait_for_selector('main, article, [role="main"], .content, .post-content', 
                                  timeout=5000, state='visible')
        except:
            pass
            
        # Extract main content
        content_selectors = [
            'main',
            'article',
            '[role="main"]',
            '#main-content',
            '.main-content',
            '.content',
            '.post-content',
            '.entry-content',
            '.article-body',
            '.story-body',
            '.post-body',
            '[itemprop="articleBody"]'
        ]
        
        main_content = ""
        for selector in content_selectors:
            try:
                elements = page.query_selector_all(selector)
                for element in elements:
                    text = element.inner_text().strip()
                    if len(text) > len(main_content):
                        main_content = text
            except:
                continue
        
        # If no main content found, get body text but filter out navigation/footer
        if not main_content or len(main_content) < 100:
            try:
                # Remove nav, footer, header elements first
                page.evaluate('''
                    ['nav', 'footer', 'header', '.navigation', '.footer', '.header', 
                     '.sidebar', '.menu', '.advertisement', '.ads'].forEach(sel => {
                        document.querySelectorAll(sel).forEach(el => el.remove());
                    });
                ''')
                
                body = page.query_selector('body')
                if body:
                    main_content = body.inner_text()
            except:
                pass
        
        # Extract key facts and important points
        key_facts = []
        
        # Look for lists that often contain key points
        lists = page.query_selector_all('ul li, ol li')
        for item in lists[:20]:  # Limit to first 20 items
            text = item.inner_text().strip()
            if len(text) > 20 and len(text) < 200:  # Filter reasonable length items
                key_facts.append(text)
        
        # Look for highlighted or emphasized text
        emphasized = page.query_selector_all('strong, b, em, mark')
        for item in emphasized[:10]:
            text = item.inner_text().strip()
            if len(text) > 10 and len(text) < 150 and text not in key_facts:
                key_facts.append(text)
        
        # Extract citations/references
        citations = []
        
        # Look for citation elements
        citation_selectors = [
            'a[href*="doi.org"]',
            'a[href*="pubmed"]',
            'a[href*="arxiv"]',
            '.citation',
            '.reference',
            '[class*="cite"]'
        ]
        
        for selector in citation_selectors:
            elements = page.query_selector_all(selector)
            for element in elements[:10]:  # Limit citations
                text = element.inner_text().strip()
                href = element.get_attribute('href') if element.get_attribute('href') else ''
                if text:
                    citations.append({
                        'text': text,
                        'url': href
                    })
        
        # Scroll behavior with lazy loading support
        if scroll_behavior == "partial":
            # Scroll to middle
            page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)")
            page.wait_for_timeout(1000)
            
            if capture_screenshot:
                screenshot_path = SCREENSHOTS_DIR / f"page_{timestamp}_middle.png"
                page.screenshot(path=str(screenshot_path), full_page=False)
                screenshots.append(str(screenshot_path))
                logger.info(f"📸 Middle screenshot saved: {screenshot_path}")
                
        elif scroll_behavior == "full":
            # Scroll through the entire page with lazy loading support
            last_height = page.evaluate("document.body.scrollHeight")
            viewport_height = 900
            current_position = 0
            scroll_attempts = 0
            max_scroll_attempts = 10
            
            while scroll_attempts < max_scroll_attempts:
                # Scroll down gradually
                while current_position < last_height:
                    page.evaluate(f"window.scrollTo(0, {current_position})")
                    page.wait_for_timeout(500)  # Wait for content to load
                    
                    if capture_screenshot and current_position > 0:
                        # Capture screenshots at key positions
                        if current_position == viewport_height or current_position >= last_height - viewport_height:
                            screenshot_path = SCREENSHOTS_DIR / f"page_{timestamp}_scroll_{current_position}.png"
                            screenshot_bytes = page.screenshot(path=str(screenshot_path), full_page=False)
                            screenshot_b64 = base64.b64encode(screenshot_bytes).decode('utf-8')
                            
                            # Extract text using OCR
                            ocr_text = extract_text_from_screenshot(screenshot_bytes)
                            
                            screenshots.append(str(screenshot_path))
                            screenshot_data.append({
                                'type': 'scroll',
                                'path': str(screenshot_path),
                                'data': f"data:image/png;base64,{screenshot_b64}",
                                'description': f"Scrolled to position {current_position}px - viewing middle/bottom content",
                                'ocr_text': ocr_text,  # Include OCR extracted text
                                'timestamp': timestamp
                            })
                            logger.info(f"📸 Scroll screenshot saved with OCR: {screenshot_path}")
                    
                    current_position += viewport_height
                
                # Check if new content was loaded (for infinite scroll sites)
                page.wait_for_timeout(1000)
                new_height = page.evaluate("document.body.scrollHeight")
                
                if new_height == last_height:
                    # No new content loaded, we've reached the end
                    break
                else:
                    # New content loaded, continue scrolling
                    last_height = new_height
                    scroll_attempts += 1
                    logger.info(f"🔄 New content loaded, continuing scroll (attempt {scroll_attempts})")
            
            # Scroll back to top
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(500)
        
        # Extract specific sections if requested
        extracted_sections = {}
        if extract_sections:
            sections = [s.strip() for s in extract_sections.split(',')]
            for section_name in sections:
                # Try to find section by heading
                headings = page.query_selector_all('h1, h2, h3, h4')
                for heading in headings:
                    heading_text = heading.inner_text().lower()
                    if section_name.lower() in heading_text:
                        # Get the content after this heading
                        next_content = heading.evaluate('''(element) => {
                            let content = '';
                            let sibling = element.nextElementSibling;
                            while (sibling && !sibling.matches('h1, h2, h3, h4')) {
                                content += sibling.innerText + '\\n';
                                sibling = sibling.nextElementSibling;
                            }
                            return content;
                        }''')
                        if next_content:
                            extracted_sections[section_name] = next_content.strip()
                            break
        
        # Analyze content quality
        word_count = len(main_content.split())
        has_citations = len(citations) > 0
        content_depth = "shallow" if word_count < 500 else "medium" if word_count < 2000 else "deep"
        
        # Calculate quality score
        quality_score = min(10, max(1, 
            (3 if word_count > 300 else 1) +
            (2 if has_citations else 0) +
            (2 if len(key_facts) > 3 else 1) +
            (1 if author else 0) +
            (1 if pub_date else 0) +
            (1 if title else 0)
        ))
        
        # Close the page and browser to avoid threading issues
        page.close()
        context.close()
        browser.close()
        playwright.stop()
        
        # Prepare response - FOCUS ON SCREENSHOTS, NOT TEXT CONTENT
        result = {
            "success": True,
            "url": url,
            "title": title,
            "visual_summary": {
                "page_title": title,
                "screenshots_captured": len(screenshots),
                "key_visual_elements": f"Captured {len(screenshots)} screenshots showing different sections of the page",
                "brief_description": f"Page about {title[:100] if title else 'content'}... with {word_count} words visible"
            },
            "screenshots": screenshots,
            "screenshot_data": screenshot_data,  # Include base64 screenshots for visual analysis
            "browser_status": "Page loaded, scrolled, and screenshots captured successfully"
        }
        
        # Combine OCR text from all screenshots
        combined_ocr_text = ""
        for sd in screenshot_data:
            if sd.get('ocr_text'):
                combined_ocr_text += f"\n--- {sd['description']} ---\n{sd['ocr_text'][:1000]}\n"
        
        # Format nice response - FOCUS ON VISUAL INFORMATION AND OCR TEXT
        response = f"""
📄 **Visual Browser Analysis for {url}**

**Page Title:** {title or 'N/A'}

**Screenshots Captured:** {len(screenshots)}
{chr(10).join(f'  📸 {sd["description"]}' for sd in screenshot_data)}

**Text Extracted via OCR from Screenshots:**
{combined_ocr_text[:5000] if combined_ocr_text else "No text extracted"}

**Visual Analysis Summary:**
I have opened the webpage and captured {len(screenshots)} screenshots. Using OCR technology, I extracted the visible text from these screenshots. This allows me to:
- Read and understand the actual content displayed on the page
- Analyze the information without overwhelming the context
- Provide insights based on what's visually present on the page

**Data Available:** 
- Screenshots: {len(screenshot_data)} images captured
- OCR Text: {len(combined_ocr_text)} characters extracted
"""
        
        logger.info(f"✅ Successfully browsed {url}")
        return response
        
    except Exception as e:
        logger.error(f"Error browsing {url}: {str(e)}")
        # Clean up on error
        if browser:
            try:
                browser.close()
            except:
                pass
        if playwright:
            try:
                playwright.stop()
            except:
                pass
        return f"Error browsing webpage: {str(e)}"


@tool
def close_browser() -> str:
    """Close the browser when done with research.
    
    Note: Browsers are now automatically closed after each page visit to avoid threading issues.
    This function is kept for compatibility but is no longer necessary.
    
    Returns:
        Status message
    """
    logger.info("🔚 Browser auto-closes after each page visit")
    return "Browser management is now automatic - browsers close after each page visit"


@tool
def get_screenshot_content(screenshot_path: str) -> str:
    """Get the base64 encoded content of a screenshot for analysis.
    
    Use this to retrieve screenshot data for visual analysis or sharing.
    
    Args:
        screenshot_path: Path to the screenshot file
        
    Returns:
        Base64 encoded image data
    """
    try:
        with open(screenshot_path, 'rb') as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')
        
        return f"data:image/png;base64,{image_data}"
    except Exception as e:
        return f"Error reading screenshot: {str(e)}"


# Optional: Async version for better performance
async def browse_webpage_async(url: str, **kwargs) -> Dict[str, Any]:
    """Async version of browse_webpage for concurrent operations"""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(viewport={'width': 1600, 'height': 900})
        page = await context.new_page()
        
        await page.goto(url)
        # ... implement async browsing logic
        
        await browser.close()
        
    return {"status": "completed"}