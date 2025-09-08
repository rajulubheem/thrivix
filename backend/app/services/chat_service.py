from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, func, desc, select
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
import uuid

from app.models.database import ChatSession, ChatMessage, MessageRole, MessageType
from app.schemas.chat import (
    ChatSessionCreate, ChatSessionUpdate, ChatSessionResponse,
    ChatMessageCreate, ChatMessageUpdate, ChatMessageResponse,
    MessageSearchRequest, SessionSearchRequest,
    ChatSessionSummary, ChatSessionWithMessages
)


class ChatService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # Session Management
    async def create_session(self, user_id: str, session_data: ChatSessionCreate) -> ChatSessionResponse:
        """Create a new chat session"""
        session_dict = session_data.dict(exclude_unset=True)
        
        # Use provided session_id or generate a new one
        if session_data.session_id:
            session = ChatSession(
                session_id=session_data.session_id,
                user_id=user_id,
                **{k: v for k, v in session_dict.items() if k != 'session_id'}
            )
        else:
            session = ChatSession(
                user_id=user_id,
                **session_dict
            )
        
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return ChatSessionResponse.from_orm(session)

    async def get_session(self, session_id: str, user_id: str) -> Optional[ChatSessionResponse]:
        """Get a specific session"""
        result = await self.db.execute(
            select(ChatSession).filter(
                and_(
                    ChatSession.session_id == session_id,
                    ChatSession.user_id == user_id,
                    ChatSession.is_active == True
                )
            )
        )
        session = result.scalars().first()
        return ChatSessionResponse.from_orm(session) if session else None

    async def list_user_sessions(
        self, 
        user_id: str,
        skip: int = 0,
        limit: int = 20,
        include_archived: bool = False
    ) -> List[ChatSessionSummary]:
        """List all sessions for a user"""
        query = select(ChatSession).filter(
            and_(
                ChatSession.user_id == user_id,
                ChatSession.is_active == True
            )
        )
        
        if not include_archived:
            query = query.filter(ChatSession.is_archived == False)
        
        query = query.order_by(desc(ChatSession.updated_at))
        query = query.offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        sessions = result.scalars().all()
        
        return [ChatSessionSummary.from_orm(session) for session in sessions]

    async def update_session(
        self, 
        session_id: str, 
        user_id: str, 
        session_update: ChatSessionUpdate
    ) -> Optional[ChatSessionResponse]:
        """Update a session"""
        result = await self.db.execute(
            select(ChatSession).filter(
                and_(
                    ChatSession.session_id == session_id,
                    ChatSession.user_id == user_id,
                    ChatSession.is_active == True
                )
            )
        )
        session = result.scalars().first()
        
        if not session:
            return None
        
        update_data = session_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(session, field, value)
        
        session.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(session)
        
        return ChatSessionResponse.from_orm(session)

    async def delete_session(self, session_id: str, user_id: str) -> bool:
        """Soft delete a session"""
        result = await self.db.execute(
            select(ChatSession).filter(
                and_(
                    ChatSession.session_id == session_id,
                    ChatSession.user_id == user_id,
                    ChatSession.is_active == True
                )
            )
        )
        session = result.scalars().first()
        
        if not session:
            return False
        
        session.is_deleted = True
        session.updated_at = datetime.utcnow()
        await self.db.commit()
        
        return True

    # Message Management
    async def add_message(
        self, 
        session_id: str, 
        user_id: str, 
        message_data: ChatMessageCreate
    ) -> ChatMessageResponse:
        """Add a message to a session"""
        # Verify session exists and belongs to user
        result = await self.db.execute(
            select(ChatSession).filter(
                and_(
                    ChatSession.session_id == session_id,
                    ChatSession.user_id == user_id,
                    ChatSession.is_active == True
                )
            )
        )
        session = result.scalars().first()
        
        if not session:
            raise ValueError(f"Session {session_id} not found for user {user_id}")
        
        # Create message
        message = ChatMessage(
            session_id=session_id,
            message_id=str(uuid.uuid4()),
            **message_data.dict(exclude_unset=True)
        )
        
        self.db.add(message)
        
        # Update session
        session.message_count += 1
        session.last_message_at = datetime.utcnow()
        session.updated_at = datetime.utcnow()
        
        await self.db.commit()
        await self.db.refresh(message)
        
        return ChatMessageResponse.from_orm(message)

    async def get_session_messages(
        self,
        session_id: str,
        skip: int = 0,
        limit: int = 100
    ) -> List[ChatMessageResponse]:
        """Get messages for a session"""
        result = await self.db.execute(
            select(ChatMessage)
            .filter(
                and_(
                    ChatMessage.session_id == session_id,
                    ChatMessage.is_deleted == False
                )
            )
            .order_by(ChatMessage.created_at)
            .offset(skip)
            .limit(limit)
        )
        messages = result.scalars().all()
        
        return [ChatMessageResponse.from_orm(msg) for msg in messages]

    async def get_session_with_messages(
        self,
        session_id: str,
        user_id: str,
        message_limit: int = 100,
        message_offset: int = 0
    ) -> Optional[ChatSessionWithMessages]:
        """Get a session with its messages"""
        # Get session
        session_result = await self.db.execute(
            select(ChatSession).filter(
                and_(
                    ChatSession.session_id == session_id,
                    ChatSession.user_id == user_id,
                    ChatSession.is_active == True
                )
            )
        )
        session = session_result.scalars().first()
        
        if not session:
            return None
        
        # Get messages
        messages = await self.get_session_messages(session_id, skip=message_offset, limit=message_limit)
        
        return ChatSessionWithMessages(
            **ChatSessionResponse.from_orm(session).dict(),
            messages=messages
        )

    async def delete_message(
        self,
        message_id: str,
        session_id: str,
        user_id: str
    ) -> bool:
        """Soft delete a message"""
        # Verify session ownership
        session_result = await self.db.execute(
            select(ChatSession).filter(
                and_(
                    ChatSession.session_id == session_id,
                    ChatSession.user_id == user_id,
                    ChatSession.is_active == True
                )
            )
        )
        session = session_result.scalars().first()
        
        if not session:
            return False
        
        # Delete message
        message_result = await self.db.execute(
            select(ChatMessage).filter(
                and_(
                    ChatMessage.message_id == message_id,
                    ChatMessage.session_id == session_id,
                    ChatMessage.is_deleted == False
                )
            )
        )
        message = message_result.scalars().first()
        
        if not message:
            return False
        
        message.is_deleted = True
        message.updated_at = datetime.utcnow()
        
        # Update session message count
        session.message_count = max(0, session.message_count - 1)
        session.updated_at = datetime.utcnow()
        
        await self.db.commit()
        
        return True

    # Search Operations
    async def search_messages(
        self,
        user_id: str,
        search_request: MessageSearchRequest
    ) -> List[ChatMessageResponse]:
        """Search messages across sessions"""
        query = select(ChatMessage).join(ChatSession).filter(
            and_(
                ChatSession.user_id == user_id,
                ChatSession.is_active == True,
                ChatMessage.is_deleted == False
            )
        )
        
        if search_request.query:
            query = query.filter(
                ChatMessage.content.contains(search_request.query)
            )
        
        if search_request.session_id:
            query = query.filter(ChatMessage.session_id == search_request.session_id)
        
        if search_request.role:
            query = query.filter(ChatMessage.role == search_request.role)
        
        if search_request.start_date:
            query = query.filter(ChatMessage.created_at >= search_request.start_date)
        
        if search_request.end_date:
            query = query.filter(ChatMessage.created_at <= search_request.end_date)
        
        query = query.order_by(desc(ChatMessage.created_at))
        query = query.offset(search_request.skip).limit(search_request.limit)
        
        result = await self.db.execute(query)
        messages = result.scalars().all()
        
        return [ChatMessageResponse.from_orm(msg) for msg in messages]

    async def search_sessions(
        self,
        user_id: str,
        search_request: SessionSearchRequest
    ) -> List[ChatSessionSummary]:
        """Search sessions"""
        query = select(ChatSession).filter(
            and_(
                ChatSession.user_id == user_id,
                ChatSession.is_active == True
            )
        )
        
        if search_request.query:
            query = query.filter(
                or_(
                    ChatSession.title.contains(search_request.query),
                    ChatSession.description.contains(search_request.query)
                )
            )
        
        if not search_request.include_archived:
            query = query.filter(ChatSession.is_archived == False)
        
        if search_request.start_date:
            query = query.filter(ChatSession.created_at >= search_request.start_date)
        
        if search_request.end_date:
            query = query.filter(ChatSession.created_at <= search_request.end_date)
        
        query = query.order_by(desc(ChatSession.updated_at))
        query = query.offset(search_request.skip).limit(search_request.limit)
        
        result = await self.db.execute(query)
        sessions = result.scalars().all()
        
        return [ChatSessionSummary.from_orm(session) for session in sessions]

    # Statistics
    async def get_user_statistics(self, user_id: str) -> Dict[str, Any]:
        """Get user statistics"""
        total_sessions = self.db.query(ChatSession).filter(
            and_(ChatSession.user_id == user_id, ChatSession.is_active == True)
        ).count()
        active_sessions = self.db.query(ChatSession).filter(
            and_(ChatSession.user_id == user_id, ChatSession.is_active == True)
        ).count()
        archived_sessions = self.db.query(ChatSession).filter(
            and_(ChatSession.user_id == user_id, ChatSession.is_archived == True)
        ).count()
        total_messages = self.db.query(ChatMessage).join(ChatSession).filter(
            and_(ChatSession.user_id == user_id, ChatMessage.is_deleted == False)
        ).count()
        
        return {
            "total_sessions": total_sessions,
            "active_sessions": active_sessions,
            "archived_sessions": archived_sessions,
            "total_messages": total_messages
        }


# Helper function to get chat service instance
def get_chat_service() -> ChatService:
    """
    This function should be used in dependency injection.
    For now, returning None as it needs to be called with a database session.
    """
    # This is a placeholder - in actual use, this would be injected with a database session
    # from fastapi import Depends
    # from app.core.database import get_db
    # 
    # async def get_chat_service(db: AsyncSession = Depends(get_db)) -> ChatService:
    #     return ChatService(db)
    raise NotImplementedError("Use dependency injection with database session")