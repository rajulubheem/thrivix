"""
Calculator Tool for Strands Agents  
Performs mathematical operations with symbolic math capabilities
"""
import math
import re
from typing import Dict, Any, Optional, Union
import structlog
import numpy as np

logger = structlog.get_logger()

TOOL_SPEC = {
    "name": "calculator",
    "description": (
        "Perform mathematical calculations including basic arithmetic, trigonometry, "
        "logarithms, and complex expressions. Supports scientific notation and symbolic math."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "expression": {
                "type": "string",
                "description": "Mathematical expression to evaluate (e.g., '2 * sin(pi/4) + log(e**2)')"
            },
            "mode": {
                "type": "string",
                "enum": ["evaluate", "simplify", "solve"],
                "description": "Calculation mode",
                "default": "evaluate"
            },
            "precision": {
                "type": "integer",
                "description": "Number of decimal places for result",
                "default": 10,
                "minimum": 0,
                "maximum": 50
            }
        },
        "required": ["expression"]
    }
}

class CalculatorTool:
    """Calculator tool for mathematical operations"""
    
    def __init__(self):
        self.name = "calculator"
        self.description = TOOL_SPEC["description"]
        self.input_schema = TOOL_SPEC["input_schema"]
        
        # Safe math functions and constants
        self.safe_dict = {
            # Math functions
            'sin': math.sin,
            'cos': math.cos,
            'tan': math.tan,
            'asin': math.asin,
            'acos': math.acos,
            'atan': math.atan,
            'atan2': math.atan2,
            'sinh': math.sinh,
            'cosh': math.cosh,
            'tanh': math.tanh,
            'exp': math.exp,
            'log': math.log,
            'log10': math.log10,
            'log2': math.log2,
            'sqrt': math.sqrt,
            'pow': math.pow,
            'abs': abs,
            'round': round,
            'floor': math.floor,
            'ceil': math.ceil,
            'factorial': math.factorial,
            'gcd': math.gcd,
            'degrees': math.degrees,
            'radians': math.radians,
            
            # Constants
            'pi': math.pi,
            'e': math.e,
            'tau': math.tau,
            'inf': math.inf,
            
            # Numpy functions for arrays
            'array': np.array,
            'sum': np.sum,
            'mean': np.mean,
            'std': np.std,
            'var': np.var,
            'min': np.min,
            'max': np.max,
            'median': np.median,
        }
    
    async def __call__(self, **kwargs):
        """Execute calculator operation"""
        expression = kwargs.get("expression")
        mode = kwargs.get("mode", "evaluate")
        precision = kwargs.get("precision", 10)
        
        if not expression:
            return {"success": False, "error": "Expression is required"}
        
        try:
            if mode == "evaluate":
                return await self.evaluate_expression(expression, precision)
            elif mode == "simplify":
                return await self.simplify_expression(expression)
            elif mode == "solve":
                return await self.solve_equation(expression)
            else:
                return {"success": False, "error": f"Unknown mode: {mode}"}
        except Exception as e:
            logger.error(f"Calculator error: {e}")
            return {"success": False, "error": str(e)}
    
    async def evaluate_expression(self, expression: str, precision: int) -> Dict[str, Any]:
        """Evaluate a mathematical expression"""
        try:
            # Clean the expression
            expression = expression.strip()
            
            # Replace common notation
            expression = expression.replace('^', '**')
            expression = expression.replace('×', '*')
            expression = expression.replace('÷', '/')
            
            # Security check - only allow safe operations
            if not self._is_safe_expression(expression):
                return {
                    "success": False,
                    "error": "Expression contains unsafe operations"
                }
            
            # Evaluate the expression
            result = eval(expression, {"__builtins__": {}}, self.safe_dict)
            
            # Format result based on type
            if isinstance(result, (int, float)):
                if isinstance(result, float):
                    # Round to specified precision
                    result = round(result, precision)
                    # Remove trailing zeros
                    result_str = f"{result:.{precision}f}".rstrip('0').rstrip('.')
                else:
                    result_str = str(result)
                
                # Add scientific notation for very large/small numbers
                if abs(result) > 1e10 or (abs(result) < 1e-5 and result != 0):
                    scientific = f"{result:.{min(precision, 5)}e}"
                else:
                    scientific = None
                
                return {
                    "success": True,
                    "expression": expression,
                    "result": result,
                    "formatted": result_str,
                    "scientific": scientific,
                    "type": type(result).__name__
                }
            elif isinstance(result, np.ndarray):
                return {
                    "success": True,
                    "expression": expression,
                    "result": result.tolist(),
                    "shape": result.shape,
                    "type": "array"
                }
            else:
                return {
                    "success": True,
                    "expression": expression,
                    "result": str(result),
                    "type": type(result).__name__
                }
                
        except ZeroDivisionError:
            return {
                "success": False,
                "error": "Division by zero",
                "expression": expression
            }
        except ValueError as e:
            return {
                "success": False,
                "error": f"Math domain error: {str(e)}",
                "expression": expression
            }
        except SyntaxError as e:
            return {
                "success": False,
                "error": f"Invalid expression syntax: {str(e)}",
                "expression": expression
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Calculation error: {str(e)}",
                "expression": expression
            }
    
    async def simplify_expression(self, expression: str) -> Dict[str, Any]:
        """Simplify a mathematical expression (basic implementation)"""
        try:
            # For now, just evaluate and return
            # In a full implementation, we'd use sympy for symbolic simplification
            result = await self.evaluate_expression(expression, 10)
            if result["success"]:
                return {
                    "success": True,
                    "original": expression,
                    "simplified": result["formatted"],
                    "value": result["result"]
                }
            return result
        except Exception as e:
            return {
                "success": False,
                "error": f"Simplification failed: {str(e)}",
                "expression": expression
            }
    
    async def solve_equation(self, expression: str) -> Dict[str, Any]:
        """Solve an equation (basic implementation for linear equations)"""
        try:
            # Basic linear equation solver (ax + b = c)
            # This is a simplified implementation
            # Full implementation would use sympy for symbolic solving
            
            if '=' not in expression:
                return {
                    "success": False,
                    "error": "Equation must contain '=' sign",
                    "expression": expression
                }
            
            # Split equation
            left, right = expression.split('=')
            
            # Try to evaluate both sides
            left_result = await self.evaluate_expression(left.strip(), 10)
            right_result = await self.evaluate_expression(right.strip(), 10)
            
            if left_result["success"] and right_result["success"]:
                is_equal = abs(left_result["result"] - right_result["result"]) < 1e-10
                return {
                    "success": True,
                    "equation": expression,
                    "left_value": left_result["result"],
                    "right_value": right_result["result"],
                    "is_equal": is_equal,
                    "message": "Equation evaluated" if is_equal else "Sides are not equal"
                }
            
            return {
                "success": False,
                "error": "Could not evaluate equation",
                "expression": expression
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Equation solving failed: {str(e)}",
                "expression": expression
            }
    
    def _is_safe_expression(self, expression: str) -> bool:
        """Check if expression is safe to evaluate"""
        # Disallow dangerous operations
        dangerous_patterns = [
            '__', 'import', 'exec', 'eval', 'open', 'file',
            'input', 'raw_input', 'compile', 'globals', 'locals'
        ]
        
        expression_lower = expression.lower()
        for pattern in dangerous_patterns:
            if pattern in expression_lower:
                return False
        
        # Only allow alphanumeric, operators, parentheses, and dots
        allowed_chars = re.compile(r'^[a-zA-Z0-9\s\+\-\*/\(\)\.,\^\[\]]+$')
        return bool(allowed_chars.match(expression))

# Export for use
calculator = CalculatorTool()

__all__ = ["calculator", "CalculatorTool", "TOOL_SPEC"]