"""
Planning-Enabled Agent for Strands
An enhanced agent that automatically plans, decomposes tasks, manages todos, and executes recursively
"""
import json
import asyncio
from typing import Dict, Any, Optional, List, Union
from datetime import datetime
import structlog

logger = structlog.get_logger()

class PlanningAgent:
    """
    An enhanced agent that can plan and execute complex tasks systematically.
    Similar to how Claude Code works with todos and planning.
    """
    
    def __init__(self, name: str = "PlanningAgent", model: str = "gpt-4o-mini"):
        self.name = name
        self.model = model
        self.current_plan = None
        self.todos = []
        self.execution_history = []
        self.context = {}
        
    async def process_task(self, task: str, context: Dict = None) -> Dict:
        """
        Process a task by planning, creating todos, and executing systematically.
        This is the main entry point that mimics Claude Code's behavior.
        """
        try:
            logger.info(f"🎯 {self.name} starting task: {task}")
            
            # Step 1: Create a plan
            plan = await self._create_plan(task, context)
            if not plan["success"]:
                return plan
            
            # Step 2: Convert plan to todos
            todos = await self._plan_to_todos(plan["plan"])
            if not todos["success"]:
                return todos
            
            # Step 3: Execute todos systematically
            execution_result = await self._execute_todos()
            
            # Step 4: Summarize results
            summary = await self._summarize_execution(task, execution_result)
            
            return {
                "success": True,
                "task": task,
                "plan": plan["plan"],
                "todos_completed": execution_result["completed"],
                "todos_failed": execution_result["failed"],
                "summary": summary,
                "execution_time": execution_result.get("execution_time", "Unknown")
            }
            
        except Exception as e:
            logger.error(f"Planning agent error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _create_plan(self, task: str, context: Dict = None) -> Dict:
        """Create a detailed plan for the task"""
        from app.tools.tool_registry import tool_registry
        
        # Use task_planner tool
        result = await tool_registry.execute_tool("task_planner", {
            "task": task,
            "context": context or {},
            "decompose_depth": 2,
            "include_tools": True,
            "estimate_time": True
        })
        
        if result.get("success"):
            self.current_plan = result["plan"]
            logger.info(f"✅ Created plan with {len(result['plan']['steps'])} steps")
        
        return result
    
    async def _plan_to_todos(self, plan: Dict) -> Dict:
        """Convert plan steps to todos"""
        from app.tools.tool_registry import tool_registry
        
        todos = []
        for i, step in enumerate(plan["steps"]):
            todo = {
                "id": step["id"],
                "content": step["action"],
                "status": "pending",
                "priority": 5 - min(i, 4),  # Higher priority for earlier steps
                "tags": ["planned", plan["type"]],
                "dependencies": step.get("dependencies", [])
            }
            
            # Add recommended tools as metadata
            if "recommended_tools" in step:
                todo["tools"] = step["recommended_tools"]
            
            # Add substeps as nested todos
            if "substeps" in step:
                for substep in step["substeps"]:
                    todos.append({
                        "id": substep["id"],
                        "content": substep["action"],
                        "status": "pending",
                        "priority": todo["priority"] - 1,
                        "tags": ["substep"],
                        "dependencies": [step["id"]]
                    })
            
            todos.append(todo)
        
        # Add todos using agent_todo tool
        result = await tool_registry.execute_tool("agent_todo", {
            "action": "add",
            "todos": todos
        })
        
        if result.get("success"):
            self.todos = todos
            logger.info(f"✅ Created {len(todos)} todos from plan")
        
        return result
    
    async def _execute_todos(self) -> Dict:
        """Execute todos systematically"""
        from app.tools.tool_registry import tool_registry
        
        completed = []
        failed = []
        start_time = datetime.now()
        
        while True:
            # Get next todo to work on
            next_todo = await self._get_next_todo()
            if not next_todo:
                break  # No more todos to execute
            
            logger.info(f"🔄 Working on: {next_todo['content']}")
            
            # Mark as in progress
            await tool_registry.execute_tool("agent_todo", {
                "action": "update",
                "todo_id": next_todo["id"],
                "status": "in_progress"
            })
            
            # Execute the todo
            execution_result = await self._execute_todo_item(next_todo)
            
            if execution_result["success"]:
                # Mark as completed
                await tool_registry.execute_tool("agent_todo", {
                    "action": "complete",
                    "todo_id": next_todo["id"]
                })
                completed.append(next_todo["id"])
                logger.info(f"✅ Completed: {next_todo['content']}")
            else:
                # Mark as failed
                await tool_registry.execute_tool("agent_todo", {
                    "action": "update",
                    "todo_id": next_todo["id"],
                    "status": "failed"
                })
                failed.append(next_todo["id"])
                logger.error(f"❌ Failed: {next_todo['content']}")
                
                # Decide whether to continue
                if not self._should_continue_after_failure(next_todo):
                    break
            
            # Store results in context for next steps
            self.context[f"step_{next_todo['id']}_result"] = execution_result
        
        execution_time = (datetime.now() - start_time).total_seconds()
        
        return {
            "completed": completed,
            "failed": failed,
            "total": len(self.todos),
            "execution_time": f"{execution_time:.2f} seconds"
        }
    
    async def _get_next_todo(self) -> Optional[Dict]:
        """Get the next todo to work on"""
        from app.tools.tool_registry import tool_registry
        
        # Get pending and in-progress todos
        result = await tool_registry.execute_tool("agent_todo", {
            "action": "list",
            "filter": {"status": "pending"}
        })
        
        if not result.get("success") or not result.get("todos"):
            return None
        
        # Find first todo without unmet dependencies
        for todo in result["todos"]:
            if not todo.get("dependencies"):
                return todo
            
            # Check if all dependencies are completed
            deps_met = True
            for dep_id in todo["dependencies"]:
                dep_result = await tool_registry.execute_tool("agent_todo", {
                    "action": "get",
                    "todo_id": dep_id
                })
                if dep_result.get("success"):
                    dep_todo = dep_result.get("todo", {})
                    if dep_todo.get("status") != "completed":
                        deps_met = False
                        break
            
            if deps_met:
                return todo
        
        return None
    
    async def _execute_todo_item(self, todo: Dict) -> Dict:
        """Execute a single todo item"""
        from app.tools.tool_registry import tool_registry
        
        # Get recommended tools for this todo
        tools = todo.get("tools", ["think"])
        
        # Build execution steps
        steps = []
        for tool in tools:
            # Determine parameters based on tool and todo content
            parameters = self._get_tool_parameters(tool, todo["content"])
            steps.append({
                "tool": tool,
                "parameters": parameters
            })
        
        # Execute using recursive_executor
        result = await tool_registry.execute_tool("recursive_executor", {
            "steps": steps,
            "continue_on_error": False,
            "parallel": False
        })
        
        return result
    
    def _get_tool_parameters(self, tool: str, content: str) -> Dict:
        """Get appropriate parameters for a tool based on the todo content"""
        # This is a simplified version - in production, would use NLP to extract parameters
        
        if tool == "think":
            return {"thought": content, "cycle_count": 3}
        elif tool == "tavily_search":
            return {"query": content}
        elif tool == "file_write":
            return {"path": "/tmp/output.txt", "content": f"Working on: {content}"}
        elif tool == "python_repl":
            return {"code": f"# Task: {content}\nprint('Executing task')"}
        elif tool == "memory":
            return {
                "action": "store",
                "key": f"task_{content[:20]}",
                "value": {"task": content, "timestamp": datetime.now().isoformat()}
            }
        else:
            return {"input": content}
    
    def _should_continue_after_failure(self, failed_todo: Dict) -> bool:
        """Decide whether to continue after a todo fails"""
        # Continue if the failed todo has low priority or is tagged as optional
        if failed_todo.get("priority", 3) <= 2:
            return True
        if "optional" in failed_todo.get("tags", []):
            return True
        return False
    
    async def _summarize_execution(self, task: str, execution_result: Dict) -> str:
        """Summarize the execution results"""
        total = execution_result.get("total", 0)
        completed = len(execution_result.get("completed", []))
        failed = len(execution_result.get("failed", []))
        
        if completed == total:
            status = "Successfully completed"
        elif completed > 0:
            status = "Partially completed"
        else:
            status = "Failed"
        
        summary = (
            f"{status} task: {task}\n"
            f"Completed: {completed}/{total} steps\n"
            f"Failed: {failed} steps\n"
            f"Execution time: {execution_result.get('execution_time', 'Unknown')}"
        )
        
        return summary
    
    async def review_progress(self) -> Dict:
        """Review current progress on todos"""
        from app.tools.tool_registry import tool_registry
        
        result = await tool_registry.execute_tool("agent_todo", {
            "action": "list"
        })
        
        if result.get("success"):
            stats = result.get("stats", {})
            todos = result.get("todos", [])
            
            # Create progress report
            report = {
                "total_todos": stats.get("total", 0),
                "completed": stats.get("completed", 0),
                "in_progress": stats.get("in_progress", 0),
                "pending": stats.get("pending", 0),
                "failed": stats.get("failed", 0),
                "blocked": stats.get("blocked", 0),
                "completion_rate": (
                    stats.get("completed", 0) / stats.get("total", 1) * 100
                    if stats.get("total", 0) > 0 else 0
                ),
                "current_focus": next(
                    (t["content"] for t in todos if t["status"] == "in_progress"),
                    "No task in progress"
                )
            }
            
            return {"success": True, "progress": report}
        
        return result

# Create a factory function for easy agent creation
def create_planning_agent(name: str = "PlanningAgent", model: str = "gpt-4o-mini") -> PlanningAgent:
    """Factory function to create a planning-enabled agent"""
    return PlanningAgent(name, model)

# Example usage function
async def example_usage():
    """Example of how to use the planning agent"""
    
    # Create a planning agent
    agent = create_planning_agent("TaskMaster")
    
    # Give it a complex task
    task = "Build a web scraper that collects news articles and stores them in a database"
    
    # Process the task (agent will plan, create todos, and execute)
    result = await agent.process_task(task, context={
        "requirements": ["Python", "SQLite", "BeautifulSoup"],
        "deadline": "2 days"
    })
    
    # Check progress
    progress = await agent.review_progress()
    
    return result, progress

__all__ = ["PlanningAgent", "create_planning_agent", "example_usage"]