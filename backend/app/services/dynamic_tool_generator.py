"""
Dynamic Tool Generator for Strands Agents
Generates Python tools on-the-fly based on tool specifications
"""

import os
import json
import textwrap
from typing import Dict, Any, List, Optional
from pathlib import Path
from dataclasses import dataclass
from strands import tool

@dataclass
class ToolSpecification:
    """Specification for a dynamic tool"""
    name: str
    description: str
    parameters: List[Dict[str, Any]]
    implementation_hint: str = ""
    category: str = "general"
    requires_packages: List[str] = None

class DynamicToolGenerator:
    """Generates Python tools dynamically based on specifications"""

    def __init__(self, tools_directory: str = "./generated_tools"):
        """Initialize the tool generator

        Args:
            tools_directory: Directory where generated tools will be saved
        """
        self.tools_dir = Path(tools_directory)
        self.tools_dir.mkdir(parents=True, exist_ok=True)

        # Common tool templates based on categories
        self.templates = self._load_templates()

    def _load_templates(self) -> Dict[str, str]:
        """Load common tool implementation templates"""
        return {
            'file_operation': '''
@tool
def {name}({params}) -> str:
    """{description}

    Args:
        {args_doc}
    """
    import os
    import pathlib

    try:
        # File operation implementation
        {implementation}
        return f"Successfully completed {name}"
    except Exception as e:
        return f"Error in {name}: {{str(e)}}"
''',
            'api_call': '''
@tool
def {name}({params}) -> dict:
    """{description}

    Args:
        {args_doc}
    """
    import requests
    import json

    try:
        # API call implementation
        {implementation}
        return {{"status": "success", "data": response_data}}
    except Exception as e:
        return {{"status": "error", "message": str(e)}}
''',
            'data_processing': '''
@tool
def {name}({params}) -> Any:
    """{description}

    Args:
        {args_doc}
    """
    import pandas as pd
    import numpy as np

    try:
        # Data processing implementation
        {implementation}
        return result
    except Exception as e:
        return f"Error processing data: {{str(e)}}"
''',
            'ml_operation': '''
@tool
def {name}({params}) -> dict:
    """{description}

    Args:
        {args_doc}
    """
    try:
        # ML operation implementation
        {implementation}
        return {{"status": "success", "result": result}}
    except Exception as e:
        return {{"status": "error", "message": str(e)}}
''',
            'generic': '''
@tool
def {name}({params}) -> Any:
    """{description}

    Args:
        {args_doc}
    """
    try:
        # Generic tool implementation
        {implementation}
        return result
    except Exception as e:
        return f"Error in {name}: {{str(e)}}"
'''
        }

    def generate_tool(self, spec: ToolSpecification, validate: bool = True) -> str:
        """Generate a Python tool from specification

        Args:
            spec: Tool specification
            validate: Whether to validate the generated tool

        Returns:
            Path to the generated tool file
        """
        # Select appropriate template
        template = self.templates.get(spec.category, self.templates['generic'])

        # Generate parameter string and documentation
        params_list = []
        args_doc_list = []
        for param in spec.parameters:
            param_name = param['name']
            param_type = param.get('type', 'Any')
            param_desc = param.get('description', '')
            param_default = param.get('default')

            if param_default is not None:
                params_list.append(f"{param_name}: {param_type} = {repr(param_default)}")
            else:
                params_list.append(f"{param_name}: {param_type}")

            args_doc_list.append(f"{param_name}: {param_desc}")

        params_str = ", ".join(params_list) if params_list else ""
        args_doc_str = "\n        ".join(args_doc_list) if args_doc_list else "No parameters"

        # Generate implementation based on hints
        implementation = self._generate_implementation(spec)

        # Fill in the template
        tool_code = template.format(
            name=spec.name,
            params=params_str,
            description=spec.description,
            args_doc=args_doc_str,
            implementation=implementation
        )

        # Add imports
        imports = ["from strands import tool", "from typing import Any, Dict, List, Optional"]
        if spec.requires_packages:
            for package in spec.requires_packages:
                imports.append(f"# Requires: pip install {package}")

        full_code = "\n".join(imports) + "\n\n" + tool_code

        # Save to file
        tool_file = self.tools_dir / f"{spec.name}.py"
        tool_file.write_text(full_code)

        if validate:
            self._validate_tool(tool_file)

        return str(tool_file)

    def _generate_implementation(self, spec: ToolSpecification) -> str:
        """Generate implementation based on tool specification and hints"""

        if spec.implementation_hint:
            return spec.implementation_hint

        # Generate smart implementation based on tool name and category
        implementations = {
            'file_operation': '''
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        # Perform file operation
        result = path.read_text()
''',
            'api_call': '''
        url = f"{base_url}/{endpoint}"
        headers = {"Content-Type": "application/json"}

        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        response_data = response.json()
''',
            'data_processing': '''
        # Process input data
        if isinstance(data, str):
            df = pd.read_csv(data)
        else:
            df = pd.DataFrame(data)

        # Apply transformations
        result = df.describe().to_dict()
''',
            'ml_operation': '''
        # Perform ML operation
        import sklearn
        from sklearn.model_selection import train_test_split

        # Basic ML operation placeholder
        result = {"accuracy": 0.95, "model": "placeholder"}
''',
            'generic': '''
        # Generic implementation placeholder
        # This tool needs proper implementation
        result = f"Executed {spec.name} with provided parameters"
'''
        }

        return implementations.get(spec.category, implementations['generic']).replace('{spec.name}', spec.name)

    def _validate_tool(self, tool_path: Path) -> bool:
        """Validate that the generated tool can be imported and executed"""
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location("dynamic_tool", tool_path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return True
        except Exception as e:
            print(f"Validation error for {tool_path}: {e}")
            return False

    def generate_missing_tools(self, required_tools: List[str], available_tools: List[str]) -> Dict[str, str]:
        """Generate any missing tools from the required list

        Args:
            required_tools: List of required tool names
            available_tools: List of currently available tools

        Returns:
            Dictionary mapping tool names to generated file paths
        """
        generated = {}
        missing = set(required_tools) - set(available_tools)

        for tool_name in missing:
            spec = self._infer_tool_spec(tool_name)
            if spec:
                try:
                    tool_path = self.generate_tool(spec)
                    generated[tool_name] = tool_path
                    print(f"Generated tool: {tool_name} at {tool_path}")
                except Exception as e:
                    print(f"Failed to generate {tool_name}: {e}")

        return generated

    def _infer_tool_spec(self, tool_name: str) -> Optional[ToolSpecification]:
        """Infer tool specification from tool name"""

        # Common tool patterns
        patterns = {
            'file': 'file_operation',
            'api': 'api_call',
            'http': 'api_call',
            'data': 'data_processing',
            'ml': 'ml_operation',
            'model': 'ml_operation',
            'analyze': 'data_processing',
            'process': 'data_processing',
            'fetch': 'api_call',
            'read': 'file_operation',
            'write': 'file_operation',
            'save': 'file_operation',
            'load': 'file_operation'
        }

        # Determine category
        category = 'generic'
        for pattern, cat in patterns.items():
            if pattern in tool_name.lower():
                category = cat
                break

        # Generate basic spec
        spec = ToolSpecification(
            name=tool_name,
            description=f"Automatically generated tool for {tool_name.replace('_', ' ')}",
            parameters=self._infer_parameters(tool_name, category),
            category=category
        )

        return spec

    def _infer_parameters(self, tool_name: str, category: str) -> List[Dict[str, Any]]:
        """Infer parameters based on tool name and category"""

        param_templates = {
            'file_operation': [
                {'name': 'file_path', 'type': 'str', 'description': 'Path to the file'},
                {'name': 'mode', 'type': 'str', 'default': 'r', 'description': 'File operation mode'}
            ],
            'api_call': [
                {'name': 'endpoint', 'type': 'str', 'description': 'API endpoint'},
                {'name': 'params', 'type': 'dict', 'default': {}, 'description': 'Query parameters'},
                {'name': 'headers', 'type': 'dict', 'default': {}, 'description': 'Request headers'}
            ],
            'data_processing': [
                {'name': 'data', 'type': 'Any', 'description': 'Input data to process'},
                {'name': 'options', 'type': 'dict', 'default': {}, 'description': 'Processing options'}
            ],
            'ml_operation': [
                {'name': 'data', 'type': 'Any', 'description': 'Training or inference data'},
                {'name': 'model_config', 'type': 'dict', 'default': {}, 'description': 'Model configuration'}
            ],
            'generic': [
                {'name': 'input_data', 'type': 'Any', 'description': 'Input data for the tool'},
                {'name': 'config', 'type': 'dict', 'default': {}, 'description': 'Tool configuration'}
            ]
        }

        return param_templates.get(category, param_templates['generic'])

    def create_tool_from_user_spec(self, user_spec: Dict[str, Any]) -> str:
        """Create a tool from user-provided specification

        Args:
            user_spec: Dictionary containing tool specification from user

        Returns:
            Path to generated tool file
        """
        spec = ToolSpecification(
            name=user_spec['name'],
            description=user_spec.get('description', ''),
            parameters=user_spec.get('parameters', []),
            implementation_hint=user_spec.get('implementation', ''),
            category=user_spec.get('category', 'generic')
        )

        return self.generate_tool(spec, validate=True)


# Example usage and testing
if __name__ == "__main__":
    generator = DynamicToolGenerator()

    # Example: Generate a missing tool
    spec = ToolSpecification(
        name="sentiment_analyzer",
        description="Analyze sentiment of text",
        parameters=[
            {'name': 'text', 'type': 'str', 'description': 'Text to analyze'},
            {'name': 'language', 'type': 'str', 'default': 'en', 'description': 'Language code'}
        ],
        category='data_processing',
        implementation_hint='''
        # Simple sentiment analysis placeholder
        positive_words = ['good', 'great', 'excellent', 'amazing']
        negative_words = ['bad', 'terrible', 'awful', 'horrible']

        text_lower = text.lower()
        positive_count = sum(1 for word in positive_words if word in text_lower)
        negative_count = sum(1 for word in negative_words if word in text_lower)

        if positive_count > negative_count:
            sentiment = 'positive'
        elif negative_count > positive_count:
            sentiment = 'negative'
        else:
            sentiment = 'neutral'

        result = {
            'sentiment': sentiment,
            'confidence': 0.75,
            'positive_score': positive_count,
            'negative_score': negative_count
        }
'''
    )

    tool_path = generator.generate_tool(spec)
    print(f"Generated tool at: {tool_path}")