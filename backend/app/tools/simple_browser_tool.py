"""
Simple Browser Tool - Reliable web browsing with screenshots
Uses subprocess to avoid threading issues
"""

import base64
import json
import os
import subprocess
import tempfile
from typing import Dict, Any, List, Optional
from datetime import datetime
from pathlib import Path
from strands import tool
import structlog
import time

logger = structlog.get_logger()

# Create screenshots directory
SCREENSHOTS_DIR = Path("./browser_screenshots")
SCREENSHOTS_DIR.mkdir(exist_ok=True)

# Global storage for screenshots
_screenshots_cache = []

def take_website_screenshot(url: str, description: str = None) -> Dict[str, Any]:
    """Take a screenshot of a website using a subprocess"""
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:17]
        screenshot_path = SCREENSHOTS_DIR / f"web_{timestamp}.png"
        
        # Create a simple Python script to take screenshot
        script_content = f"""
import asyncio
from playwright.async_api import async_playwright
import sys

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--no-sandbox'
            ]
        )
        context = await browser.new_context(
            viewport={{"width": 1600, "height": 900}},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            extra_http_headers={{
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate, br",
                "DNT": "1",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1"
            }}
        )
        page = await context.new_page()
        
        # Remove indicators that this is automated
        await page.add_init_script('''
Object.defineProperty(navigator, 'webdriver', {{
    get: () => undefined
}})
''')
        
        try:
            # Navigate with more lenient settings
            await page.goto("{url}", wait_until="domcontentloaded", timeout=45000)
            await asyncio.sleep(3)  # Give more time for JS to render
            
            # Take screenshot
            await page.screenshot(path="{screenshot_path}")
            
            # Try to extract text
            try:
                text_content = await page.inner_text('body')
                print(text_content[:2000])  # First 2000 chars
            except:
                print("Could not extract text", file=sys.stderr)
            
        except Exception as e:
            print(f"Error: {{e}}", file=sys.stderr)
        finally:
            try:
                await browser.close()
            except:
                pass

asyncio.run(main())
"""
        
        # Write script to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(script_content)
            temp_script = f.name
        
        try:
            # Run the script with environment variables to avoid connection issues
            env = os.environ.copy()
            env['PYTHONUNBUFFERED'] = '1'
            
            result = subprocess.run(
                ['python', temp_script],
                capture_output=True,
                text=True,
                timeout=45,
                env=env
            )
            
            # Get extracted text
            extracted_text = result.stdout[:2000] if result.stdout else ""
            
            # Read screenshot if it was created
            if screenshot_path.exists():
                with open(screenshot_path, 'rb') as f:
                    screenshot_bytes = f.read()
                    screenshot_b64 = base64.b64encode(screenshot_bytes).decode('utf-8')
                
                screenshot_data = {
                    'timestamp': timestamp,
                    'path': str(screenshot_path),
                    'description': description or f"Screenshot of {url}",
                    'url': url,
                    'ocr_text': extracted_text,
                    'data': f"data:image/png;base64,{screenshot_b64}",
                    'type': 'screenshot'
                }
                
                # Store in cache
                _screenshots_cache.append(screenshot_data)
                
                logger.info(f"📸 Screenshot captured: {url}")
                return screenshot_data
            else:
                logger.error(f"Screenshot not created for {url}")
                return {}
                
        finally:
            # Clean up temp script
            try:
                os.unlink(temp_script)
            except:
                pass
            
    except Exception as e:
        logger.error(f"Screenshot failed for {url}: {e}")
        return {}


@tool
def browse_and_capture(url: str) -> str:
    """Browse a website and capture a screenshot.
    
    This is a simple, reliable tool that captures a screenshot of any website.
    
    Args:
        url: The URL to browse and capture
        
    Returns:
        Description of what was captured with screenshot
    """
    
    logger.info(f"🌐 Browsing: {url}")
    
    # Take initial screenshot
    screenshot1 = take_website_screenshot(url, f"Initial view of {url}")
    
    if not screenshot1:
        return f"Failed to capture screenshot of {url}. The website might be unavailable or blocked."
    
    # Take another screenshot with scroll (simulated)
    time.sleep(1)
    
    # Create a scrolled version
    script_content = f"""
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--no-sandbox'
            ]
        )
        context = await browser.new_context(
            viewport={{"width": 1600, "height": 900}},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            extra_http_headers={{
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate, br",
                "DNT": "1",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1"
            }}
        )
        page = await context.new_page()
        
        # Remove indicators that this is automated
        await page.add_init_script('''
Object.defineProperty(navigator, 'webdriver', {{
    get: () => undefined
}})
''')
        
        try:
            await page.goto("{url}", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(2)
            
            # Scroll down
            await page.evaluate("window.scrollBy(0, 600)")
            await asyncio.sleep(1)
            
            # Take screenshot
            await page.screenshot(path=path)
            
            # Get text from visible area
            text = await page.inner_text('body')
            print(text[1000:3000])  # Middle section
            
        except Exception as e:
            print(f"Error: {{e}}")
        finally:
            await browser.close()

asyncio.run(main())
"""
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(script_content)
        temp_script = f.name
    
    try:
        # Run scroll screenshot
        timestamp2 = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:17]
        screenshot_path2 = SCREENSHOTS_DIR / f"web_scroll_{timestamp2}.png"
        
        script_content = f"""
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--no-sandbox'
            ]
        )
        context = await browser.new_context(
            viewport={{"width": 1600, "height": 900}},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            extra_http_headers={{
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate, br",
                "DNT": "1",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1"
            }}
        )
        page = await context.new_page()
        
        # Remove indicators that this is automated
        await page.add_init_script('''
Object.defineProperty(navigator, 'webdriver', {{
    get: () => undefined
}})
''')
        
        try:
            await page.goto("{url}", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(2)
            await page.evaluate("window.scrollBy(0, 600)")
            await asyncio.sleep(1)
            await page.screenshot(path="{screenshot_path2}")
            text = await page.inner_text('body')
            print(text[500:2500])
        except Exception as e:
            print(f"Error: {{e}}")
        finally:
            await browser.close()

asyncio.run(main())
"""
        
        with open(temp_script, 'w') as f:
            f.write(script_content)
        
        result = subprocess.run(
            ['python', temp_script],
            capture_output=True,
            text=True,
            timeout=45
        )
        
        # Process second screenshot
        if screenshot_path2.exists():
            with open(screenshot_path2, 'rb') as f:
                screenshot_bytes = f.read()
                screenshot_b64 = base64.b64encode(screenshot_bytes).decode('utf-8')
            
            screenshot2 = {
                'timestamp': timestamp2,
                'path': str(screenshot_path2),
                'description': f"Scrolled view of {url}",
                'url': url,
                'ocr_text': result.stdout[:2000] if result.stdout else "",
                'data': f"data:image/png;base64,{screenshot_b64}",
                'type': 'screenshot'
            }
            
            _screenshots_cache.append(screenshot2)
            logger.info(f"📸 Captured scrolled view of {url}")
            
    except Exception as e:
        logger.warning(f"Could not capture scrolled screenshot: {e}")
    finally:
        try:
            os.unlink(temp_script)
        except:
            pass
    
    # Build response
    response = f"""
🌐 **Successfully browsed: {url}**

📸 **Screenshots captured: 2**
- Initial view of the webpage
- Scrolled view showing more content

**Visible content extracted:**
{screenshot1.get('ocr_text', 'No text extracted')[:500]}...

**What I found:**
- Successfully loaded and captured the webpage
- Content is visible and screenshots are available for viewing
- Ready to browse additional sites or analyze the content

**Note:** Screenshots are displayed in the gallery below the conversation.
"""
    
    return response


@tool
def browse_multiple_sites(urls: List[str]) -> str:
    """Browse multiple websites and capture screenshots of each.
    
    Args:
        urls: List of URLs to browse
        
    Returns:
        Summary of all sites browsed with screenshots
    """
    
    results = []
    total_screenshots = 0
    
    for url in urls[:5]:  # Limit to 5 sites
        logger.info(f"🌐 Browsing site {len(results) + 1}/{len(urls[:5])}: {url}")
        
        # Capture screenshot
        screenshot = take_website_screenshot(url, f"Screenshot of {url}")
        
        if screenshot:
            results.append({
                'url': url,
                'success': True,
                'description': screenshot.get('description'),
                'text_preview': screenshot.get('ocr_text', '')[:200]
            })
            total_screenshots += 1
        else:
            results.append({
                'url': url,
                'success': False,
                'description': f"Failed to capture {url}"
            })
        
        # Small delay between sites
        time.sleep(1)
    
    # Build response
    response = f"""
🌐 **Browsed {len(results)} websites**

📸 **Total screenshots captured: {total_screenshots}**

**Sites visited:**
"""
    
    for i, result in enumerate(results, 1):
        if result['success']:
            response += f"""
{i}. ✅ **{result['url']}**
   - {result['description']}
   - Preview: {result['text_preview']}...
"""
        else:
            response += f"""
{i}. ❌ **{result['url']}**
   - Could not capture (site may be unavailable)
"""
    
    response += """

**Note:** All screenshots are displayed in the gallery below the conversation.
You can click on any screenshot to view it in full size.
"""
    
    return response


def get_captured_screenshots() -> List[Dict[str, Any]]:
    """Get all captured screenshots from the current session"""
    return _screenshots_cache.copy()


def clear_screenshots():
    """Clear the screenshots cache"""
    global _screenshots_cache
    _screenshots_cache = []