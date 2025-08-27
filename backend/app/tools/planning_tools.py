"""
Planning and Task Management Tools for Strands Agents
Provides agents with the ability to plan, decompose tasks, manage todos, and execute recursively
"""
import json
import uuid
from typing import Dict, Any, Optional, List, Union, Callable
from datetime import datetime
import structlog
import asyncio
from enum import Enum

logger = structlog.get_logger()

class TaskStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    BLOCKED = "blocked"

# Task Planner Tool
TASK_PLANNER_SPEC = {
    "name": "task_planner",
    "description": (
        "Create comprehensive task plans with decomposition, dependencies, and execution strategies. "
        "Breaks down complex tasks into manageable steps with proper sequencing."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "task": {
                "type": "string",
                "description": "The main task to accomplish"
            },
            "context": {
                "type": "object",
                "description": "Additional context and requirements"
            },
            "decompose_depth": {
                "type": "integer",
                "description": "How many levels deep to decompose tasks",
                "default": 2,
                "minimum": 1,
                "maximum": 5
            },
            "include_tools": {
                "type": "boolean",
                "description": "Include tool recommendations for each step",
                "default": True
            },
            "estimate_time": {
                "type": "boolean",
                "description": "Estimate time for each step",
                "default": True
            }
        },
        "required": ["task"]
    }
}

class TaskPlannerTool:
    """Task planning and decomposition tool"""
    
    def __init__(self):
        self.name = "task_planner"
        self.description = TASK_PLANNER_SPEC["description"]
        self.input_schema = TASK_PLANNER_SPEC["input_schema"]
        self.plans = {}
    
    async def __call__(self, **kwargs):
        """Create a task plan"""
        task = kwargs.get("task")
        context = kwargs.get("context", {})
        decompose_depth = kwargs.get("decompose_depth", 2)
        include_tools = kwargs.get("include_tools", True)
        estimate_time = kwargs.get("estimate_time", True)
        
        if not task:
            return {"success": False, "error": "Task is required"}
        
        try:
            # Generate plan ID
            plan_id = str(uuid.uuid4())
            
            # Analyze task and create plan
            plan = await self._create_plan(
                task, context, decompose_depth, include_tools, estimate_time
            )
            
            # Store plan
            self.plans[plan_id] = {
                "id": plan_id,
                "task": task,
                "context": context,
                "plan": plan,
                "created_at": datetime.now().isoformat(),
                "status": "created"
            }
            
            return {
                "success": True,
                "plan_id": plan_id,
                "plan": plan,
                "total_steps": len(plan["steps"]),
                "estimated_time": plan.get("total_time", "Unknown"),
                "message": "Plan created successfully"
            }
            
        except Exception as e:
            logger.error(f"Task planner error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _create_plan(self, task: str, context: Dict, depth: int, 
                          include_tools: bool, estimate_time: bool) -> Dict:
        """Create a detailed task plan"""
        
        # Analyze task type
        task_type = self._analyze_task_type(task)
        
        # Generate steps based on task type
        steps = self._generate_steps(task, task_type, depth)
        
        # Add tool recommendations
        if include_tools:
            for step in steps:
                step["recommended_tools"] = self._recommend_tools(step["action"])
        
        # Add time estimates
        total_time = 0
        if estimate_time:
            for step in steps:
                step["estimated_time"] = self._estimate_time(step["action"])
                total_time += step["estimated_time"]
        
        # Identify dependencies
        for i, step in enumerate(steps):
            step["dependencies"] = self._identify_dependencies(step, steps[:i])
        
        return {
            "task": task,
            "type": task_type,
            "steps": steps,
            "total_time": total_time,
            "parallel_possible": self._can_parallelize(steps),
            "complexity": self._calculate_complexity(steps)
        }
    
    def _analyze_task_type(self, task: str) -> str:
        """Analyze what type of task this is"""
        task_lower = task.lower()
        
        if any(word in task_lower for word in ["build", "create", "develop", "implement"]):
            return "development"
        elif any(word in task_lower for word in ["analyze", "research", "investigate", "study"]):
            return "analysis"
        elif any(word in task_lower for word in ["fix", "debug", "repair", "resolve"]):
            return "debugging"
        elif any(word in task_lower for word in ["test", "verify", "validate", "check"]):
            return "testing"
        elif any(word in task_lower for word in ["deploy", "release", "publish", "launch"]):
            return "deployment"
        else:
            return "general"
    
    def _generate_steps(self, task: str, task_type: str, depth: int) -> List[Dict]:
        """Generate task steps based on type"""
        steps = []
        
        if task_type == "development":
            steps = [
                {"id": "1", "action": "Analyze requirements", "level": 1},
                {"id": "2", "action": "Design solution architecture", "level": 1},
                {"id": "3", "action": "Set up development environment", "level": 1},
                {"id": "4", "action": "Implement core functionality", "level": 1},
                {"id": "5", "action": "Add error handling", "level": 1},
                {"id": "6", "action": "Write tests", "level": 1},
                {"id": "7", "action": "Document code", "level": 1},
                {"id": "8", "action": "Review and refactor", "level": 1}
            ]
        elif task_type == "analysis":
            steps = [
                {"id": "1", "action": "Define analysis objectives", "level": 1},
                {"id": "2", "action": "Gather relevant data", "level": 1},
                {"id": "3", "action": "Process and clean data", "level": 1},
                {"id": "4", "action": "Perform analysis", "level": 1},
                {"id": "5", "action": "Generate insights", "level": 1},
                {"id": "6", "action": "Create visualizations", "level": 1},
                {"id": "7", "action": "Prepare report", "level": 1}
            ]
        elif task_type == "debugging":
            steps = [
                {"id": "1", "action": "Reproduce the issue", "level": 1},
                {"id": "2", "action": "Collect error logs", "level": 1},
                {"id": "3", "action": "Identify root cause", "level": 1},
                {"id": "4", "action": "Develop fix", "level": 1},
                {"id": "5", "action": "Test fix", "level": 1},
                {"id": "6", "action": "Deploy fix", "level": 1}
            ]
        else:
            # Generic steps
            steps = [
                {"id": "1", "action": f"Understand: {task}", "level": 1},
                {"id": "2", "action": "Research existing solutions", "level": 1},
                {"id": "3", "action": "Plan approach", "level": 1},
                {"id": "4", "action": "Execute main task", "level": 1},
                {"id": "5", "action": "Verify results", "level": 1},
                {"id": "6", "action": "Document outcome", "level": 1}
            ]
        
        # Add sub-steps if depth > 1
        if depth > 1:
            for step in steps[:3]:  # Add substeps to first 3 steps
                step["substeps"] = [
                    {"id": f"{step['id']}.1", "action": f"Prepare for {step['action']}", "level": 2},
                    {"id": f"{step['id']}.2", "action": f"Execute {step['action']}", "level": 2},
                    {"id": f"{step['id']}.3", "action": f"Validate {step['action']}", "level": 2}
                ]
        
        return steps
    
    def _recommend_tools(self, action: str) -> List[str]:
        """Recommend tools for a specific action"""
        action_lower = action.lower()
        tools = []
        
        if any(word in action_lower for word in ["analyze", "research"]):
            tools.extend(["tavily_search", "think", "retrieve"])
        if any(word in action_lower for word in ["implement", "code", "develop"]):
            tools.extend(["editor", "python_repl", "file_write"])
        if any(word in action_lower for word in ["test", "verify"]):
            tools.extend(["python_repl", "shell_command"])
        if any(word in action_lower for word in ["document", "write"]):
            tools.extend(["file_write", "editor"])
        if any(word in action_lower for word in ["data", "process"]):
            tools.extend(["calculator", "python_repl"])
        if any(word in action_lower for word in ["deploy", "release"]):
            tools.extend(["shell_command", "use_aws"])
        
        return tools[:3] if tools else ["think", "memory"]
    
    def _estimate_time(self, action: str) -> int:
        """Estimate time in minutes for an action"""
        action_lower = action.lower()
        
        if any(word in action_lower for word in ["implement", "develop", "build"]):
            return 30
        elif any(word in action_lower for word in ["analyze", "research"]):
            return 20
        elif any(word in action_lower for word in ["test", "verify"]):
            return 15
        elif any(word in action_lower for word in ["document", "write"]):
            return 10
        else:
            return 5
    
    def _identify_dependencies(self, step: Dict, previous_steps: List[Dict]) -> List[str]:
        """Identify which previous steps this step depends on"""
        dependencies = []
        action_lower = step["action"].lower()
        
        # Generally, each step depends on the previous one
        if previous_steps:
            dependencies.append(previous_steps[-1]["id"])
        
        # Add specific dependencies based on action
        if "test" in action_lower or "verify" in action_lower:
            for prev in previous_steps:
                if "implement" in prev["action"].lower():
                    dependencies.append(prev["id"])
        
        return list(set(dependencies))
    
    def _can_parallelize(self, steps: List[Dict]) -> bool:
        """Check if any steps can be run in parallel"""
        # Check if there are steps without dependencies on each other
        for i, step in enumerate(steps[1:], 1):
            if not step.get("dependencies") or len(step["dependencies"]) < i:
                return True
        return False
    
    def _calculate_complexity(self, steps: List[Dict]) -> str:
        """Calculate task complexity"""
        total_steps = len(steps)
        total_substeps = sum(len(s.get("substeps", [])) for s in steps)
        
        if total_steps + total_substeps > 15:
            return "high"
        elif total_steps + total_substeps > 8:
            return "medium"
        else:
            return "low"

# Agent Todo Tool
AGENT_TODO_SPEC = {
    "name": "agent_todo",
    "description": (
        "Manage todos and track task progress for agents. "
        "Provides todo list functionality similar to human task management."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["add", "update", "complete", "list", "get", "remove", "clear"],
                "description": "Todo action to perform"
            },
            "todos": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "content": {"type": "string"},
                        "status": {"type": "string", "enum": ["pending", "in_progress", "completed", "failed", "blocked"]},
                        "priority": {"type": "integer", "minimum": 1, "maximum": 5},
                        "tags": {"type": "array", "items": {"type": "string"}},
                        "dependencies": {"type": "array", "items": {"type": "string"}}
                    }
                },
                "description": "Todo items to add or update"
            },
            "todo_id": {
                "type": "string",
                "description": "ID of specific todo"
            },
            "filter": {
                "type": "object",
                "properties": {
                    "status": {"type": "string"},
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "priority": {"type": "integer"}
                },
                "description": "Filter criteria for listing todos"
            }
        },
        "required": ["action"]
    }
}

class AgentTodoTool:
    """Todo management for agents"""
    
    def __init__(self):
        self.name = "agent_todo"
        self.description = AGENT_TODO_SPEC["description"]
        self.input_schema = AGENT_TODO_SPEC["input_schema"]
        self.todos = {}
        self.todo_history = []
    
    async def __call__(self, **kwargs):
        """Execute todo action"""
        action = kwargs.get("action")
        
        try:
            if action == "add":
                return await self._add_todos(kwargs)
            elif action == "update":
                return await self._update_todo(kwargs)
            elif action == "complete":
                return await self._complete_todo(kwargs)
            elif action == "list":
                return await self._list_todos(kwargs)
            elif action == "get":
                return await self._get_todo(kwargs)
            elif action == "remove":
                return await self._remove_todo(kwargs)
            elif action == "clear":
                return await self._clear_todos()
            else:
                return {"success": False, "error": f"Unknown action: {action}"}
                
        except Exception as e:
            logger.error(f"Agent todo error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _add_todos(self, params: Dict) -> Dict:
        """Add new todos"""
        todos = params.get("todos", [])
        
        if not todos:
            return {"success": False, "error": "Todos are required"}
        
        added = []
        for todo in todos:
            todo_id = todo.get("id", str(uuid.uuid4()))
            
            todo_item = {
                "id": todo_id,
                "content": todo.get("content", ""),
                "status": todo.get("status", "pending"),
                "priority": todo.get("priority", 3),
                "tags": todo.get("tags", []),
                "dependencies": todo.get("dependencies", []),
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            
            self.todos[todo_id] = todo_item
            added.append(todo_item)
            
            # Add to history
            self.todo_history.append({
                "action": "added",
                "todo_id": todo_id,
                "timestamp": datetime.now().isoformat()
            })
        
        return {
            "success": True,
            "added": added,
            "count": len(added),
            "message": f"Added {len(added)} todo(s)"
        }
    
    async def _update_todo(self, params: Dict) -> Dict:
        """Update a todo"""
        todo_id = params.get("todo_id")
        
        if not todo_id:
            return {"success": False, "error": "Todo ID is required"}
        
        if todo_id not in self.todos:
            return {"success": False, "error": f"Todo {todo_id} not found"}
        
        todo = self.todos[todo_id]
        
        # Update fields
        if "content" in params:
            todo["content"] = params["content"]
        if "status" in params:
            old_status = todo["status"]
            todo["status"] = params["status"]
            
            # Track status changes
            self.todo_history.append({
                "action": "status_changed",
                "todo_id": todo_id,
                "from": old_status,
                "to": params["status"],
                "timestamp": datetime.now().isoformat()
            })
        if "priority" in params:
            todo["priority"] = params["priority"]
        if "tags" in params:
            todo["tags"] = params["tags"]
        if "dependencies" in params:
            todo["dependencies"] = params["dependencies"]
        
        todo["updated_at"] = datetime.now().isoformat()
        
        return {
            "success": True,
            "todo": todo,
            "message": f"Updated todo {todo_id}"
        }
    
    async def _complete_todo(self, params: Dict) -> Dict:
        """Mark a todo as completed"""
        todo_id = params.get("todo_id")
        
        if not todo_id:
            return {"success": False, "error": "Todo ID is required"}
        
        if todo_id not in self.todos:
            return {"success": False, "error": f"Todo {todo_id} not found"}
        
        todo = self.todos[todo_id]
        todo["status"] = "completed"
        todo["completed_at"] = datetime.now().isoformat()
        todo["updated_at"] = datetime.now().isoformat()
        
        # Check if this unblocks other todos
        unblocked = []
        for other_id, other_todo in self.todos.items():
            if todo_id in other_todo.get("dependencies", []):
                other_todo["dependencies"].remove(todo_id)
                if not other_todo["dependencies"] and other_todo["status"] == "blocked":
                    other_todo["status"] = "pending"
                    unblocked.append(other_id)
        
        # Add to history
        self.todo_history.append({
            "action": "completed",
            "todo_id": todo_id,
            "timestamp": datetime.now().isoformat()
        })
        
        return {
            "success": True,
            "todo": todo,
            "unblocked": unblocked,
            "message": f"Completed todo {todo_id}"
        }
    
    async def _list_todos(self, params: Dict) -> Dict:
        """List todos with optional filtering"""
        filter_criteria = params.get("filter", {})
        
        filtered_todos = []
        for todo_id, todo in self.todos.items():
            # Apply filters
            if filter_criteria:
                if "status" in filter_criteria and todo["status"] != filter_criteria["status"]:
                    continue
                if "priority" in filter_criteria and todo["priority"] != filter_criteria["priority"]:
                    continue
                if "tags" in filter_criteria:
                    if not any(tag in todo["tags"] for tag in filter_criteria["tags"]):
                        continue
            
            filtered_todos.append(todo)
        
        # Sort by priority and status
        status_order = {"in_progress": 0, "blocked": 1, "pending": 2, "completed": 3, "failed": 4}
        filtered_todos.sort(key=lambda x: (status_order.get(x["status"], 5), -x["priority"]))
        
        # Calculate statistics
        stats = {
            "total": len(filtered_todos),
            "pending": sum(1 for t in filtered_todos if t["status"] == "pending"),
            "in_progress": sum(1 for t in filtered_todos if t["status"] == "in_progress"),
            "completed": sum(1 for t in filtered_todos if t["status"] == "completed"),
            "blocked": sum(1 for t in filtered_todos if t["status"] == "blocked"),
            "failed": sum(1 for t in filtered_todos if t["status"] == "failed")
        }
        
        return {
            "success": True,
            "todos": filtered_todos,
            "stats": stats
        }
    
    async def _get_todo(self, params: Dict) -> Dict:
        """Get a specific todo"""
        todo_id = params.get("todo_id")
        
        if not todo_id:
            return {"success": False, "error": "Todo ID is required"}
        
        if todo_id not in self.todos:
            return {"success": False, "error": f"Todo {todo_id} not found"}
        
        return {
            "success": True,
            "todo": self.todos[todo_id]
        }
    
    async def _remove_todo(self, params: Dict) -> Dict:
        """Remove a todo"""
        todo_id = params.get("todo_id")
        
        if not todo_id:
            return {"success": False, "error": "Todo ID is required"}
        
        if todo_id not in self.todos:
            return {"success": False, "error": f"Todo {todo_id} not found"}
        
        removed_todo = self.todos.pop(todo_id)
        
        # Add to history
        self.todo_history.append({
            "action": "removed",
            "todo_id": todo_id,
            "timestamp": datetime.now().isoformat()
        })
        
        return {
            "success": True,
            "removed": removed_todo,
            "message": f"Removed todo {todo_id}"
        }
    
    async def _clear_todos(self) -> Dict:
        """Clear all todos"""
        count = len(self.todos)
        self.todos.clear()
        
        # Add to history
        self.todo_history.append({
            "action": "cleared_all",
            "count": count,
            "timestamp": datetime.now().isoformat()
        })
        
        return {
            "success": True,
            "cleared": count,
            "message": f"Cleared {count} todos"
        }

# Recursive Executor Tool
RECURSIVE_EXECUTOR_SPEC = {
    "name": "recursive_executor",
    "description": (
        "Execute tasks recursively with tool chaining and conditional logic. "
        "Enables agents to use tools in sequence and handle complex workflows."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "plan_id": {
                "type": "string",
                "description": "ID of the plan to execute"
            },
            "steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "tool": {"type": "string"},
                        "parameters": {"type": "object"},
                        "condition": {"type": "string"},
                        "on_success": {"type": "object"},
                        "on_failure": {"type": "object"},
                        "retry": {"type": "integer", "default": 1}
                    }
                },
                "description": "Steps to execute if no plan_id"
            },
            "max_depth": {
                "type": "integer",
                "description": "Maximum recursion depth",
                "default": 5
            },
            "parallel": {
                "type": "boolean",
                "description": "Execute independent steps in parallel",
                "default": False
            },
            "continue_on_error": {
                "type": "boolean",
                "description": "Continue execution if a step fails",
                "default": False
            }
        },
        "required": []
    }
}

class RecursiveExecutorTool:
    """Recursive task execution with tool chaining"""
    
    def __init__(self):
        self.name = "recursive_executor"
        self.description = RECURSIVE_EXECUTOR_SPEC["description"]
        self.input_schema = RECURSIVE_EXECUTOR_SPEC["input_schema"]
        self.execution_history = []
        self.execution_context = {}
    
    async def __call__(self, **kwargs):
        """Execute tasks recursively"""
        plan_id = kwargs.get("plan_id")
        steps = kwargs.get("steps", [])
        max_depth = kwargs.get("max_depth", 5)
        parallel = kwargs.get("parallel", False)
        continue_on_error = kwargs.get("continue_on_error", False)
        
        try:
            # Get steps from plan if plan_id provided
            if plan_id:
                # In real implementation, would fetch from task planner
                steps = self._get_plan_steps(plan_id)
            
            if not steps:
                return {"success": False, "error": "No steps to execute"}
            
            # Initialize execution context
            context = {
                "depth": 0,
                "max_depth": max_depth,
                "results": {},
                "errors": [],
                "executed": []
            }
            
            # Execute steps
            if parallel:
                result = await self._execute_parallel(steps, context, continue_on_error)
            else:
                result = await self._execute_sequential(steps, context, continue_on_error)
            
            # Store execution history
            self.execution_history.append({
                "timestamp": datetime.now().isoformat(),
                "steps_count": len(steps),
                "success": result["success"],
                "context": context
            })
            
            return result
            
        except Exception as e:
            logger.error(f"Recursive executor error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _execute_sequential(self, steps: List[Dict], context: Dict, 
                                 continue_on_error: bool) -> Dict:
        """Execute steps sequentially"""
        results = []
        
        for i, step in enumerate(steps):
            # Check recursion depth
            if context["depth"] >= context["max_depth"]:
                return {
                    "success": False,
                    "error": "Maximum recursion depth reached",
                    "results": results
                }
            
            # Execute step
            step_result = await self._execute_step(step, context)
            results.append(step_result)
            context["executed"].append(step.get("tool", f"step_{i}"))
            
            if not step_result["success"]:
                context["errors"].append(step_result.get("error"))
                
                if not continue_on_error:
                    return {
                        "success": False,
                        "error": f"Step {i} failed: {step_result.get('error')}",
                        "results": results,
                        "executed": context["executed"]
                    }
            
            # Handle conditional execution
            if step_result["success"] and "on_success" in step:
                context["depth"] += 1
                nested_result = await self._execute_nested(
                    step["on_success"], context, continue_on_error
                )
                results.append(nested_result)
                context["depth"] -= 1
                
            elif not step_result["success"] and "on_failure" in step:
                context["depth"] += 1
                nested_result = await self._execute_nested(
                    step["on_failure"], context, continue_on_error
                )
                results.append(nested_result)
                context["depth"] -= 1
        
        return {
            "success": len(context["errors"]) == 0,
            "results": results,
            "executed": context["executed"],
            "errors": context["errors"]
        }
    
    async def _execute_parallel(self, steps: List[Dict], context: Dict,
                               continue_on_error: bool) -> Dict:
        """Execute steps in parallel"""
        tasks = []
        
        for step in steps:
            task = self._execute_step(step, context)
            tasks.append(task)
        
        # Execute all tasks in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                processed_results.append({
                    "success": False,
                    "error": str(result)
                })
                context["errors"].append(str(result))
            else:
                processed_results.append(result)
                if not result.get("success"):
                    context["errors"].append(result.get("error"))
        
        return {
            "success": len(context["errors"]) == 0 or continue_on_error,
            "results": processed_results,
            "executed": [s.get("tool", f"step_{i}") for i, s in enumerate(steps)],
            "errors": context["errors"]
        }
    
    async def _execute_step(self, step: Dict, context: Dict) -> Dict:
        """Execute a single step"""
        tool_name = step.get("tool")
        parameters = step.get("parameters", {})
        retry = step.get("retry", 1)
        
        # Resolve parameters with context
        resolved_params = self._resolve_parameters(parameters, context)
        
        # Try to execute with retries
        for attempt in range(retry):
            try:
                # Import tool registry
                from app.tools.tool_registry import tool_registry
                
                # Execute tool
                result = await tool_registry.execute_tool(tool_name, resolved_params)
                
                if result.get("success"):
                    # Store result in context
                    context["results"][tool_name] = result
                    return result
                
                if attempt < retry - 1:
                    await asyncio.sleep(1)  # Wait before retry
                    
            except Exception as e:
                if attempt == retry - 1:
                    return {"success": False, "error": str(e)}
                await asyncio.sleep(1)
        
        return {"success": False, "error": f"Failed after {retry} attempts"}
    
    async def _execute_nested(self, nested_config: Dict, context: Dict,
                            continue_on_error: bool) -> Dict:
        """Execute nested steps"""
        if "steps" in nested_config:
            return await self._execute_sequential(
                nested_config["steps"], context, continue_on_error
            )
        elif "tool" in nested_config:
            return await self._execute_step(nested_config, context)
        else:
            return {"success": False, "error": "Invalid nested configuration"}
    
    def _resolve_parameters(self, parameters: Dict, context: Dict) -> Dict:
        """Resolve parameters with context variables"""
        resolved = {}
        
        for key, value in parameters.items():
            if isinstance(value, str) and value.startswith("$"):
                # Resolve from context
                var_path = value[1:].split(".")
                resolved_value = context
                
                for part in var_path:
                    if isinstance(resolved_value, dict) and part in resolved_value:
                        resolved_value = resolved_value[part]
                    else:
                        resolved_value = value  # Keep original if not found
                        break
                
                resolved[key] = resolved_value
            else:
                resolved[key] = value
        
        return resolved
    
    def _get_plan_steps(self, plan_id: str) -> List[Dict]:
        """Get steps from a plan (would fetch from task planner in real implementation)"""
        # Placeholder - in real implementation would fetch from task planner
        return []

# Export tools
task_planner = TaskPlannerTool()
agent_todo = AgentTodoTool()
recursive_executor = RecursiveExecutorTool()

__all__ = [
    "task_planner", "TaskPlannerTool", "TASK_PLANNER_SPEC",
    "agent_todo", "AgentTodoTool", "AGENT_TODO_SPEC",
    "recursive_executor", "RecursiveExecutorTool", "RECURSIVE_EXECUTOR_SPEC",
    "TaskStatus"
]