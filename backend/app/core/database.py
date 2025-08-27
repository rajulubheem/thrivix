from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import text
import structlog
import os
from app.config import settings

logger = structlog.get_logger()

# Create async engine for SQLite
DATABASE_URL = "sqlite+aiosqlite:///./strands_swarm.db"

engine = create_async_engine(
    DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False}
)

AsyncSessionLocal = async_sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=AsyncSession
)

Base = declarative_base()


async def init_db():
    """Initialize database and create tables"""
    try:
        from app.models.database import Base as ModelsBase
        
        async with engine.begin() as conn:
            # Create all tables
            await conn.run_sync(ModelsBase.metadata.create_all)
            
        logger.info("Database initialized successfully", db_path="./strands_swarm.db")
        
        # Create default agent templates
        await create_default_agent_templates()
        
    except Exception as e:
        logger.error("Failed to initialize database", error=str(e))
        raise


async def close_db():
    """Close database connection"""
    await engine.dispose()
    logger.info("Database connection closed")


async def get_db():
    """Get database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_default_agent_templates():
    """Create default agent templates in database"""
    from app.models.database import AgentTemplate
    from sqlalchemy import select
    
    templates = [
        {
            "name": "researcher",
            "description": "Gathers information and analyzes requirements",
            "system_prompt": """You are a research specialist focused on gathering 
            information, analyzing requirements, and identifying best practices.
            You excel at finding relevant information and synthesizing it into 
            actionable insights.""",
            "tools": ["http_request", "file_read", "current_time"],
            "category": "research",
            "icon": "🔍"
        },
        {
            "name": "architect",
            "description": "Designs system architecture and structure",
            "system_prompt": """You are a system architecture specialist who designs 
            robust, scalable systems. You create detailed architectural plans,
            define APIs, and establish system boundaries.""",
            "tools": ["editor", "file_write"],
            "category": "development",
            "icon": "🏗️"
        },
        {
            "name": "developer",
            "description": "Implements solutions in code",
            "system_prompt": """You are a skilled developer who implements solutions
            based on architectural designs. You write clean, efficient code and
            follow best practices.""",
            "tools": ["editor", "python_repl", "shell", "file_write", "file_read"],
            "category": "development",
            "icon": "💻"
        },
        {
            "name": "tester",
            "description": "Validates functionality and quality",
            "system_prompt": """You are a QA specialist who validates functionality,
            writes tests, and ensures code quality. You identify edge cases and
            potential issues.""",
            "tools": ["python_repl", "shell", "file_read"],
            "category": "review",
            "icon": "🧪"
        },
        {
            "name": "documenter",
            "description": "Creates comprehensive documentation",
            "system_prompt": """You are a technical writer who creates clear,
            comprehensive documentation. You explain complex concepts simply
            and provide useful examples.""",
            "tools": ["editor", "file_write"],
            "category": "creative",
            "icon": "📝"
        },
        {
            "name": "reviewer",
            "description": "Performs final quality checks",
            "system_prompt": """You are a senior reviewer who performs final
            quality checks. You ensure all requirements are met and provide
            constructive feedback.""",
            "tools": ["file_read", "calculator"],
            "category": "review",
            "icon": "✅"
        }
    ]
    
    async with AsyncSessionLocal() as session:
        try:
            # Check if templates already exist
            result = await session.execute(select(AgentTemplate))
            existing_templates = result.scalars().all()
            
            if existing_templates:
                logger.info("Agent templates already exist, skipping creation")
                return
            
            # Create templates
            for template_data in templates:
                template = AgentTemplate(**template_data)
                session.add(template)
            
            await session.commit()
            logger.info("Created default agent templates", count=len(templates))
            
        except Exception as e:
            await session.rollback()
            logger.error("Failed to create default agent templates", error=str(e))
            raise


# Health check function
async def check_database_health():
    """Check if database is accessible"""
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error("Database health check failed", error=str(e))
        return False