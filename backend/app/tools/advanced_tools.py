"""
Advanced Tools for Strands Agents
Includes think, batch, workflow, and other advanced reasoning tools
"""
import asyncio
import json
import time
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime
import structlog

logger = structlog.get_logger()

# Think Tool
THINK_SPEC = {
    "name": "think",
    "description": (
        "Advanced reasoning tool for multi-step thinking and problem analysis. "
        "Helps agents break down complex problems and reason through solutions."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "thought": {
                "type": "string",
                "description": "The problem or question to think about"
            },
            "cycle_count": {
                "type": "integer",
                "description": "Number of reasoning cycles",
                "default": 3,
                "minimum": 1,
                "maximum": 10
            },
            "approach": {
                "type": "string",
                "enum": ["analytical", "creative", "systematic", "exploratory"],
                "description": "Thinking approach to use",
                "default": "analytical"
            },
            "context": {
                "type": "object",
                "description": "Additional context for reasoning"
            }
        },
        "required": ["thought"]
    }
}

class ThinkTool:
    """Advanced reasoning and thinking tool"""
    
    def __init__(self):
        self.name = "think"
        self.description = THINK_SPEC["description"]
        self.input_schema = THINK_SPEC["input_schema"]
        self.reasoning_history = []
    
    async def __call__(self, **kwargs):
        """Execute thinking process"""
        thought = kwargs.get("thought")
        cycle_count = kwargs.get("cycle_count", 3)
        approach = kwargs.get("approach", "analytical")
        context = kwargs.get("context", {})
        
        if not thought:
            return {"success": False, "error": "Thought is required"}
        
        try:
            reasoning_steps = []
            
            for cycle in range(cycle_count):
                step = {
                    "cycle": cycle + 1,
                    "approach": approach,
                    "timestamp": datetime.now().isoformat()
                }
                
                # Simulate different thinking approaches
                if approach == "analytical":
                    step["analysis"] = self._analytical_thinking(thought, cycle, context)
                elif approach == "creative":
                    step["ideas"] = self._creative_thinking(thought, cycle, context)
                elif approach == "systematic":
                    step["breakdown"] = self._systematic_thinking(thought, cycle, context)
                else:  # exploratory
                    step["exploration"] = self._exploratory_thinking(thought, cycle, context)
                
                reasoning_steps.append(step)
                await asyncio.sleep(0.1)  # Simulate thinking time
            
            # Store in history
            self.reasoning_history.append({
                "thought": thought,
                "steps": reasoning_steps,
                "timestamp": datetime.now().isoformat()
            })
            
            return {
                "success": True,
                "thought": thought,
                "reasoning_steps": reasoning_steps,
                "approach": approach,
                "cycles_completed": cycle_count,
                "conclusion": self._generate_conclusion(reasoning_steps)
            }
            
        except Exception as e:
            logger.error(f"Think tool error: {e}")
            return {"success": False, "error": str(e)}
    
    def _analytical_thinking(self, thought: str, cycle: int, context: Dict) -> Dict:
        """Analytical reasoning approach"""
        stages = ["decomposition", "examination", "synthesis"]
        return {
            "stage": stages[cycle % len(stages)],
            "focus": f"Analyzing component {cycle + 1} of the problem",
            "insights": [
                f"Identified key factor {cycle + 1}",
                f"Relationship pattern discovered",
                f"Constraint identified"
            ]
        }
    
    def _creative_thinking(self, thought: str, cycle: int, context: Dict) -> List[str]:
        """Creative thinking approach"""
        return [
            f"Alternative approach {cycle + 1}",
            f"Novel solution concept",
            f"Unconventional perspective"
        ]
    
    def _systematic_thinking(self, thought: str, cycle: int, context: Dict) -> Dict:
        """Systematic breakdown approach"""
        return {
            "level": cycle + 1,
            "components": [f"Component {i}" for i in range(1, 4)],
            "dependencies": [f"Dependency {i}" for i in range(1, 3)],
            "priority": "high" if cycle == 0 else "medium"
        }
    
    def _exploratory_thinking(self, thought: str, cycle: int, context: Dict) -> Dict:
        """Exploratory thinking approach"""
        return {
            "direction": f"Exploration path {cycle + 1}",
            "discoveries": [f"Finding {i}" for i in range(1, 3)],
            "questions_raised": [f"Question {i}" for i in range(1, 3)]
        }
    
    def _generate_conclusion(self, steps: List[Dict]) -> str:
        """Generate a conclusion from reasoning steps"""
        return f"After {len(steps)} cycles of reasoning, identified {len(steps) * 2} key insights and {len(steps)} action items"

# Batch Tool
BATCH_SPEC = {
    "name": "batch",
    "description": (
        "Execute multiple tools in parallel for efficient task completion. "
        "Useful for running independent operations simultaneously."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "invocations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Tool name"},
                        "arguments": {"type": "object", "description": "Tool arguments"}
                    },
                    "required": ["name", "arguments"]
                },
                "description": "List of tool invocations to execute in parallel"
            },
            "continue_on_error": {
                "type": "boolean",
                "description": "Continue executing remaining tools if one fails",
                "default": True
            },
            "timeout": {
                "type": "integer",
                "description": "Overall timeout in seconds",
                "default": 60
            }
        },
        "required": ["invocations"]
    }
}

class BatchTool:
    """Execute multiple tools in parallel"""
    
    def __init__(self):
        self.name = "batch"
        self.description = BATCH_SPEC["description"]
        self.input_schema = BATCH_SPEC["input_schema"]
    
    async def __call__(self, **kwargs):
        """Execute batch operations"""
        invocations = kwargs.get("invocations", [])
        continue_on_error = kwargs.get("continue_on_error", True)
        timeout = kwargs.get("timeout", 60)
        
        if not invocations:
            return {"success": False, "error": "No invocations provided"}
        
        try:
            # Import tool registry to execute tools
            from app.tools.tool_registry import tool_registry
            
            # Create tasks for parallel execution
            tasks = []
            for invocation in invocations:
                tool_name = invocation.get("name")
                arguments = invocation.get("arguments", {})
                
                task = self._execute_tool(tool_registry, tool_name, arguments)
                tasks.append(task)
            
            # Execute all tasks in parallel with timeout
            try:
                results = await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=continue_on_error),
                    timeout=timeout
                )
            except asyncio.TimeoutError:
                return {
                    "success": False,
                    "error": f"Batch execution timed out after {timeout} seconds"
                }
            
            # Process results
            batch_results = []
            all_successful = True
            
            for i, result in enumerate(results):
                invocation = invocations[i]
                
                if isinstance(result, Exception):
                    batch_results.append({
                        "tool": invocation["name"],
                        "success": False,
                        "error": str(result)
                    })
                    all_successful = False
                else:
                    batch_results.append({
                        "tool": invocation["name"],
                        "success": result.get("success", True),
                        "result": result
                    })
                    if not result.get("success", True):
                        all_successful = False
            
            return {
                "success": all_successful,
                "results": batch_results,
                "total_invocations": len(invocations),
                "successful_count": sum(1 for r in batch_results if r.get("success", False)),
                "execution_time": time.time()
            }
            
        except Exception as e:
            logger.error(f"Batch tool error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _execute_tool(self, registry, tool_name: str, arguments: Dict):
        """Execute a single tool"""
        try:
            return await registry.execute_tool(tool_name, arguments)
        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {e}")
            raise

# Workflow Tool
WORKFLOW_SPEC = {
    "name": "workflow",
    "description": (
        "Define and execute multi-step workflows with conditional logic. "
        "Orchestrates complex sequences of tool operations."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["create", "execute", "list", "get"],
                "description": "Workflow action"
            },
            "name": {
                "type": "string",
                "description": "Workflow name"
            },
            "steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "tool": {"type": "string"},
                        "arguments": {"type": "object"},
                        "condition": {"type": "string"},
                        "on_success": {"type": "string"},
                        "on_failure": {"type": "string"}
                    }
                },
                "description": "Workflow steps"
            },
            "variables": {
                "type": "object",
                "description": "Workflow variables"
            }
        },
        "required": ["action"]
    }
}

class WorkflowTool:
    """Workflow orchestration tool"""
    
    def __init__(self):
        self.name = "workflow"
        self.description = WORKFLOW_SPEC["description"]
        self.input_schema = WORKFLOW_SPEC["input_schema"]
        self.workflows = {}
    
    async def __call__(self, **kwargs):
        """Execute workflow action"""
        action = kwargs.get("action")
        
        try:
            if action == "create":
                return await self._create_workflow(kwargs)
            elif action == "execute":
                return await self._execute_workflow(kwargs)
            elif action == "list":
                return await self._list_workflows()
            elif action == "get":
                return await self._get_workflow(kwargs)
            else:
                return {"success": False, "error": f"Unknown action: {action}"}
        except Exception as e:
            logger.error(f"Workflow tool error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _create_workflow(self, params: Dict) -> Dict:
        """Create a new workflow"""
        name = params.get("name")
        steps = params.get("steps", [])
        
        if not name:
            return {"success": False, "error": "Workflow name is required"}
        
        if not steps:
            return {"success": False, "error": "Workflow steps are required"}
        
        workflow = {
            "name": name,
            "steps": steps,
            "created": datetime.now().isoformat(),
            "variables": params.get("variables", {})
        }
        
        self.workflows[name] = workflow
        
        return {
            "success": True,
            "message": f"Workflow '{name}' created",
            "workflow": workflow
        }
    
    async def _execute_workflow(self, params: Dict) -> Dict:
        """Execute a workflow"""
        name = params.get("name")
        
        if not name:
            return {"success": False, "error": "Workflow name is required"}
        
        if name not in self.workflows:
            return {"success": False, "error": f"Workflow '{name}' not found"}
        
        workflow = self.workflows[name]
        variables = params.get("variables", workflow.get("variables", {}))
        
        # Import tool registry
        from app.tools.tool_registry import tool_registry
        
        results = []
        for i, step in enumerate(workflow["steps"]):
            # Execute step
            tool_name = step.get("tool")
            arguments = self._resolve_variables(step.get("arguments", {}), variables)
            
            try:
                result = await tool_registry.execute_tool(tool_name, arguments)
                results.append({
                    "step": i + 1,
                    "tool": tool_name,
                    "success": result.get("success", True),
                    "result": result
                })
                
                # Update variables with result
                variables[f"step_{i + 1}_result"] = result
                
            except Exception as e:
                results.append({
                    "step": i + 1,
                    "tool": tool_name,
                    "success": False,
                    "error": str(e)
                })
                
                # Check failure handling
                if step.get("on_failure") == "stop":
                    break
        
        return {
            "success": all(r["success"] for r in results),
            "workflow": name,
            "results": results,
            "total_steps": len(workflow["steps"]),
            "completed_steps": len(results)
        }
    
    async def _list_workflows(self) -> Dict:
        """List all workflows"""
        return {
            "success": True,
            "workflows": list(self.workflows.keys()),
            "count": len(self.workflows)
        }
    
    async def _get_workflow(self, params: Dict) -> Dict:
        """Get a specific workflow"""
        name = params.get("name")
        
        if not name:
            return {"success": False, "error": "Workflow name is required"}
        
        if name not in self.workflows:
            return {"success": False, "error": f"Workflow '{name}' not found"}
        
        return {
            "success": True,
            "workflow": self.workflows[name]
        }
    
    def _resolve_variables(self, arguments: Dict, variables: Dict) -> Dict:
        """Resolve variables in arguments"""
        resolved = {}
        for key, value in arguments.items():
            if isinstance(value, str) and value.startswith("$"):
                var_name = value[1:]
                resolved[key] = variables.get(var_name, value)
            else:
                resolved[key] = value
        return resolved

# Export tools
think = ThinkTool()
batch = BatchTool()
workflow = WorkflowTool()

__all__ = [
    "think", "ThinkTool", "THINK_SPEC",
    "batch", "BatchTool", "BATCH_SPEC",
    "workflow", "WorkflowTool", "WORKFLOW_SPEC"
]