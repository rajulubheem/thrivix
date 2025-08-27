"""
Animated Browser Tool - Captures scrolling GIF/video of websites
"""

import base64
import os
import time
from typing import Dict, Any, List
from datetime import datetime
from pathlib import Path
from strands import tool
import structlog
from PIL import Image
import io

logger = structlog.get_logger()

# Create screenshots directory
SCREENSHOTS_DIR = Path("./browser_screenshots")
SCREENSHOTS_DIR.mkdir(exist_ok=True)

# Global storage
_animated_screenshots = []

@tool
def capture_scrolling_preview(url: str) -> str:
    """Capture a scrolling preview of a website as animated frames.
    
    This creates multiple screenshots while scrolling to create an animated preview.
    
    Args:
        url: The URL to capture
        
    Returns:
        Description with animated preview
    """
    
    import asyncio
    from playwright.async_api import async_playwright
    
    async def capture_frames():
        frames = []
        frame_data = []
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1200, "height": 800})
            
            try:
                logger.info(f"🎬 Creating animated preview of {url}")
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(2)
                
                # Get page height
                page_height = await page.evaluate("document.body.scrollHeight")
                viewport_height = 800
                
                # Calculate scroll positions (max 8 frames for quick preview)
                num_frames = min(8, max(3, page_height // viewport_height))
                scroll_step = (page_height - viewport_height) / max(num_frames - 1, 1)
                
                # Capture frames while scrolling
                for i in range(num_frames):
                    scroll_position = int(i * scroll_step)
                    await page.evaluate(f"window.scrollTo(0, {scroll_position})")
                    await asyncio.sleep(0.5)  # Small delay for smooth scrolling
                    
                    # Take screenshot
                    screenshot_bytes = await page.screenshot()
                    
                    # Convert to PIL Image and resize for GIF (smaller size)
                    img = Image.open(io.BytesIO(screenshot_bytes))
                    img.thumbnail((600, 400), Image.Resampling.LANCZOS)
                    frames.append(img)
                    
                    # Also save full-size frame as base64
                    frame_b64 = base64.b64encode(screenshot_bytes).decode('utf-8')
                    frame_data.append({
                        'frame': i + 1,
                        'scroll_position': scroll_position,
                        'data': f"data:image/png;base64,{frame_b64}"
                    })
                    
                    logger.info(f"  📸 Frame {i+1}/{num_frames} captured")
                
                # Create animated GIF
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:17]
                gif_path = SCREENSHOTS_DIR / f"preview_{timestamp}.gif"
                
                if frames:
                    # Save as animated GIF with slower frame rate for viewing
                    frames[0].save(
                        gif_path,
                        save_all=True,
                        append_images=frames[1:],
                        duration=800,  # 800ms per frame
                        loop=0,
                        optimize=True
                    )
                    
                    # Convert GIF to base64
                    with open(gif_path, 'rb') as f:
                        gif_b64 = base64.b64encode(f.read()).decode('utf-8')
                    
                    # Get page text
                    page_text = await page.inner_text('body')
                    
                    preview_data = {
                        'timestamp': timestamp,
                        'url': url,
                        'title': await page.title(),
                        'description': f"Animated scroll preview of {url}",
                        'gif_path': str(gif_path),
                        'gif_data': f"data:image/gif;base64,{gif_b64}",
                        'frames': frame_data[:3],  # Include first 3 frames as stills
                        'frame_count': len(frames),
                        'page_height': page_height,
                        'text_preview': page_text[:1000],
                        'type': 'animated_preview'
                    }
                    
                    _animated_screenshots.append(preview_data)
                    
                    return preview_data
                    
            except Exception as e:
                logger.error(f"Failed to create animated preview: {e}")
                return None
                
            finally:
                await browser.close()
    
    # Run async capture
    try:
        preview = asyncio.run(capture_frames())
        
        if preview:
            response = f"""
🎬 **Animated Preview Created for: {url}**

📊 **Preview Details:**
- Title: {preview['title']}
- Frames captured: {preview['frame_count']}
- Page height: {preview['page_height']}px
- Animation shows full page scroll

🖼️ **Preview Types Available:**
1. Animated GIF showing smooth scroll through entire page
2. Individual frame screenshots at different scroll positions

📝 **Content Preview:**
{preview['text_preview'][:500]}...

**Note:** The animated preview is displayed in the gallery below.
You can view the GIF animation or individual frames.
"""
            return response
        else:
            return f"Failed to create animated preview for {url}"
            
    except Exception as e:
        logger.error(f"Error creating preview: {e}")
        return f"Could not create animated preview: {str(e)}"


@tool
def quick_visual_scan(urls: List[str]) -> str:
    """Create quick visual previews of multiple websites.
    
    Captures key frames from each site for a quick visual overview.
    
    Args:
        urls: List of URLs to scan
        
    Returns:
        Summary with visual previews
    """
    
    import asyncio
    from playwright.async_api import async_playwright
    
    async def scan_sites():
        results = []
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            
            for url in urls[:3]:  # Limit to 3 for speed
                try:
                    page = await browser.new_page(viewport={"width": 1200, "height": 800})
                    
                    logger.info(f"🔍 Quick scan: {url}")
                    await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                    await asyncio.sleep(1)
                    
                    # Capture top, middle, bottom
                    frames = []
                    
                    # Top
                    screenshot1 = await page.screenshot()
                    frames.append(base64.b64encode(screenshot1).decode('utf-8'))
                    
                    # Middle
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)")
                    await asyncio.sleep(0.5)
                    screenshot2 = await page.screenshot()
                    frames.append(base64.b64encode(screenshot2).decode('utf-8'))
                    
                    # Bottom
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await asyncio.sleep(0.5)
                    screenshot3 = await page.screenshot()
                    frames.append(base64.b64encode(screenshot3).decode('utf-8'))
                    
                    results.append({
                        'url': url,
                        'title': await page.title(),
                        'frames': frames,
                        'success': True
                    })
                    
                    await page.close()
                    
                except Exception as e:
                    logger.error(f"Quick scan failed for {url}: {e}")
                    results.append({
                        'url': url,
                        'success': False,
                        'error': str(e)
                    })
            
            await browser.close()
            return results
    
    try:
        scan_results = asyncio.run(scan_sites())
        
        # Store screenshots
        for result in scan_results:
            if result['success'] and result.get('frames'):
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:17]
                
                for i, frame_b64 in enumerate(result['frames']):
                    position = ['top', 'middle', 'bottom'][i]
                    _animated_screenshots.append({
                        'timestamp': timestamp,
                        'url': result['url'],
                        'description': f"{position.capitalize()} of {result['url']}",
                        'data': f"data:image/png;base64,{frame_b64}",
                        'type': 'screenshot',
                        'position': position
                    })
        
        # Build response
        response = f"""
🔍 **Quick Visual Scan Complete**

📊 **Sites Scanned: {len(scan_results)}**

**Results:**
"""
        for result in scan_results:
            if result['success']:
                response += f"""
✅ **{result['url']}**
   - Title: {result['title']}
   - Captured: Top, Middle, Bottom views
"""
            else:
                response += f"""
❌ **{result['url']}**
   - Could not scan
"""
        
        response += """

**Note:** Quick preview screenshots are displayed in the gallery.
Each site has 3 key frames: top, middle, and bottom of the page.
"""
        
        return response
        
    except Exception as e:
        return f"Quick scan failed: {str(e)}"


def get_animated_previews() -> List[Dict[str, Any]]:
    """Get all animated previews and screenshots"""
    return _animated_screenshots.copy()


def clear_animated_cache():
    """Clear the animated screenshots cache"""
    global _animated_screenshots
    _animated_screenshots = []