#!/usr/bin/env python3
"""
Simple Calculator MCP Server for testing
Provides basic arithmetic operations via MCP protocol
"""
from mcp.server import FastMCP
from typing import Dict, Any
import structlog

# Set up logging
logger = structlog.get_logger()

# Create an MCP server
mcp = FastMCP("Calculator Server")

@mcp.tool(description="Add two numbers together")
def add(x: float, y: float) -> Dict[str, Any]:
    """Add two numbers"""
    result = x + y
    logger.info(f"Addition: {x} + {y} = {result}")
    return {
        "result": result,
        "operation": "addition",
        "expression": f"{x} + {y} = {result}"
    }

@mcp.tool(description="Subtract second number from first")
def subtract(x: float, y: float) -> Dict[str, Any]:
    """Subtract y from x"""
    result = x - y
    logger.info(f"Subtraction: {x} - {y} = {result}")
    return {
        "result": result,
        "operation": "subtraction",
        "expression": f"{x} - {y} = {result}"
    }

@mcp.tool(description="Multiply two numbers")
def multiply(x: float, y: float) -> Dict[str, Any]:
    """Multiply two numbers"""
    result = x * y
    logger.info(f"Multiplication: {x} * {y} = {result}")
    return {
        "result": result,
        "operation": "multiplication",
        "expression": f"{x} * {y} = {result}"
    }

@mcp.tool(description="Divide first number by second")
def divide(x: float, y: float) -> Dict[str, Any]:
    """Divide x by y"""
    if y == 0:
        logger.error("Division by zero attempted")
        return {
            "error": "Division by zero is not allowed",
            "operation": "division"
        }
    result = x / y
    logger.info(f"Division: {x} / {y} = {result}")
    return {
        "result": result,
        "operation": "division",
        "expression": f"{x} / {y} = {result}"
    }

@mcp.tool(description="Calculate the power of x to y")
def power(x: float, y: float) -> Dict[str, Any]:
    """Calculate x raised to the power of y"""
    result = x ** y
    logger.info(f"Power: {x} ^ {y} = {result}")
    return {
        "result": result,
        "operation": "power",
        "expression": f"{x} ^ {y} = {result}"
    }

@mcp.tool(description="Calculate the square root of a number")
def sqrt(x: float) -> Dict[str, Any]:
    """Calculate square root of x"""
    if x < 0:
        logger.error("Square root of negative number attempted")
        return {
            "error": "Cannot calculate square root of negative number",
            "operation": "sqrt"
        }
    import math
    result = math.sqrt(x)
    logger.info(f"Square root: √{x} = {result}")
    return {
        "result": result,
        "operation": "sqrt",
        "expression": f"√{x} = {result}"
    }

@mcp.tool(description="Calculate percentage (x% of y)")
def percentage(x: float, y: float) -> Dict[str, Any]:
    """Calculate x percent of y"""
    result = (x / 100) * y
    logger.info(f"Percentage: {x}% of {y} = {result}")
    return {
        "result": result,
        "operation": "percentage",
        "expression": f"{x}% of {y} = {result}"
    }

if __name__ == "__main__":
    print("🧮 Calculator MCP Server")
    print("=" * 50)
    print("Starting server with Streamable HTTP transport on port 8001...")
    print("Available tools:")
    print("  - add(x, y): Addition")
    print("  - subtract(x, y): Subtraction")
    print("  - multiply(x, y): Multiplication")
    print("  - divide(x, y): Division")
    print("  - power(x, y): Power")
    print("  - sqrt(x): Square root")
    print("  - percentage(x, y): Percentage")
    print("=" * 50)
    print("Server running at: http://localhost:8001/mcp/")
    print("Press Ctrl+C to stop the server")
    
    # Run the server with streamable-http transport
    # FastMCP will automatically start on port 8000 by default
    mcp.run(transport="streamable-http")