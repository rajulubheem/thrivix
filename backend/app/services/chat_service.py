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
        session = ChatSession(
            user_id=user_id,
            **session_data.dict(exclude_unset=True)
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
                    ChatSession.user_id == user_id
                )
            )
        )
        session = result.scalar_one_or_none()
        return ChatSessionResponse.from_orm(session) if session else None

    async def get_session_with_messages(self, session_id: str, user_id: str, 
                                      limit: int = 100, offset: int = 0) -> Optional[ChatSessionWithMessages]:
        """Get session with its messages"""
        result = await self.db.execute(
            select(ChatSession).filter(
                and_(
                    ChatSession.session_id == session_id,
                    ChatSession.user_id == user_id
                )
            )
        )
        session = result.scalar_one_or_none()
        
        if not session:
            return None

        messages_result = await self.db.execute(
            select(ChatMessage).filter(
                and_(
                    ChatMessage.session_id == session_id,
                    ChatMessage.is_deleted == False
                )
            ).order_by(ChatMessage.created_at.asc()).offset(offset).limit(limit)
        )
        messages = messages_result.scalars().all()

        session_data = ChatSessionResponse.from_orm(session)
        return ChatSessionWithMessages(
            **session_data.dict(),
            messages=[ChatMessageResponse.from_orm(msg) for msg in messages]
        )

    async def update_session(self, session_id: str, user_id: str, 
                           update_data: ChatSessionUpdate) -> Optional[ChatSessionResponse]:
        """Update a session"""
        result = await self.db.execute(
            select(ChatSession).filter(
                and_(
                    ChatSession.session_id == session_id,
                    ChatSession.user_id == user_id
                )
            )
        )
        session = result.scalar_one_or_none()
        
        if not session:
            return None

        for key, value in update_data.dict(exclude_unset=True).items():
            setattr(session, key, value)
        
        await self.db.commit()
        await self.db.refresh(session)
        return ChatSessionResponse.from_orm(session)

    async def delete_session(self, session_id: str, user_id: str) -> bool:
        """Delete a session and all its messages"""
        result = await self.db.execute(
            select(ChatSession).filter(
                and_(
                    ChatSession.session_id == session_id,
                    ChatSession.user_id == user_id
                )
            )
        )
        session = result.scalar_one_or_none()
        
        if not session:
            return False

        await self.db.delete(session)
        await self.db.commit()
        return True

    async def list_user_sessions(self, user_id: str, limit: int = 50, 
                               offset: int = 0, include_archived: bool = False) -> List[ChatSessionSummary]:
        """List user's sessions"""
        stmt = select(ChatSession).filter(ChatSession.user_id == user_id)
        
        if not include_archived:
            stmt = stmt.filter(ChatSession.is_archived == False)
        
        stmt = stmt.order_by(desc(ChatSession.updated_at)).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        sessions = result.scalars().all()
        
        return [ChatSessionSummary(
            id=session.id,
            session_id=session.session_id,
            title=session.title,
            last_message_at=session.last_message_at,
            message_count=session.message_count,
            is_active=session.is_active,
            is_archived=session.is_archived,
            created_at=session.created_at
        ) for session in sessions]

    # Message Management
    async def add_message(self, session_id: str, user_id: str, 
                         message_data: ChatMessageCreate) -> Optional[ChatMessageResponse]:
        """Add a message to a session"""
        # Verify session exists and belongs to user
        result = await self.db.execute(
            select(ChatSession).filter(
                and_(
                    ChatSession.session_id == session_id,
                    ChatSession.user_id == user_id
                )
            )
        )
        session = result.scalar_one_or_none()
        
        if not session:
            return None

        message = ChatMessage(
            session_id=session_id,
            **message_data.dict(exclude_unset=True)
        )
        self.db.add(message)
        
        # Update session metadata
        session.message_count += 1
        session.last_message_at = datetime.utcnow()
        if message_data.role == MessageRole.user and not session.title:
            # Auto-generate title from first user message
            session.title = self._generate_session_title(message_data.content)
        
        await self.db.commit()
        await self.db.refresh(message)
        return ChatMessageResponse.from_orm(message)

    async def update_message(self, message_id: str, user_id: str, 
                           update_data: ChatMessageUpdate) -> Optional[ChatMessageResponse]:
        """Update a message"""
        result = await self.db.execute(
            select(ChatMessage).join(ChatSession).filter(
                and_(
                    ChatMessage.message_id == message_id,
                    ChatSession.user_id == user_id
                )
            )
        )
        message = result.scalar_one_or_none()
        
        if not message:
            return None

        for key, value in update_data.dict(exclude_unset=True).items():
            setattr(message, key, value)
        
        if update_data.content:
            message.is_edited = True
            message.edit_count += 1
        
        await self.db.commit()
        await self.db.refresh(message)
        return ChatMessageResponse.from_orm(message)

    async def delete_message(self, message_id: str, user_id: str) -> bool:
        """Soft delete a message"""
        result = await self.db.execute(
            select(ChatMessage).join(ChatSession).filter(
                and_(
                    ChatMessage.message_id == message_id,
                    ChatSession.user_id == user_id
                )
            )
        )
        message = result.scalar_one_or_none()
        
        if not message:
            return False

        message.is_deleted = True
        await self.db.commit()
        return True

    # Search Functionality
    async def search_messages(self, user_id: str, search_request: MessageSearchRequest) -> Tuple[List[ChatMessageResponse], int]:
        """Search messages with filters"""
        query = self.db.query(ChatMessage).join(ChatSession).filter(
            and_(
                ChatSession.user_id == user_id,
                ChatMessage.is_deleted == False
            )
        )

        # Apply filters
        if search_request.query:
            query = query.filter(ChatMessage.content.ilike(f"%{search_request.query}%"))
        
        if search_request.session_id:
            query = query.filter(ChatMessage.session_id == search_request.session_id)
        
        if search_request.role:
            query = query.filter(ChatMessage.role == search_request.role)
        
        if search_request.message_type:
            query = query.filter(ChatMessage.message_type == search_request.message_type)
        
        if search_request.agent_name:
            query = query.filter(ChatMessage.agent_name == search_request.agent_name)
        
        if search_request.start_date:
            query = query.filter(ChatMessage.created_at >= search_request.start_date)
        
        if search_request.end_date:
            query = query.filter(ChatMessage.created_at <= search_request.end_date)

        # Get total count
        total = query.count()
        
        # Apply pagination and ordering
        messages = query.order_by(desc(ChatMessage.created_at)).offset(
            search_request.offset
        ).limit(search_request.limit).all()
        
        return [ChatMessageResponse.from_orm(msg) for msg in messages], total

    async def search_sessions(self, user_id: str, search_request: SessionSearchRequest) -> Tuple[List[ChatSessionSummary], int]:
        """Search sessions with filters"""
        query = self.db.query(ChatSession).filter(ChatSession.user_id == user_id)

        # Apply filters
        if search_request.query:
            query = query.filter(
                or_(
                    ChatSession.title.ilike(f"%{search_request.query}%"),
                    ChatSession.description.ilike(f"%{search_request.query}%")
                )
            )
        
        if search_request.is_active is not None:
            query = query.filter(ChatSession.is_active == search_request.is_active)
        
        if search_request.is_archived is not None:
            query = query.filter(ChatSession.is_archived == search_request.is_archived)
        
        if search_request.start_date:
            query = query.filter(ChatSession.created_at >= search_request.start_date)
        
        if search_request.end_date:
            query = query.filter(ChatSession.created_at <= search_request.end_date)

        # Get total count
        total = query.count()
        
        # Apply pagination and ordering
        sessions = query.order_by(desc(ChatSession.updated_at)).offset(
            search_request.offset
        ).limit(search_request.limit).all()
        
        return [ChatSessionSummary(
            id=session.id,
            session_id=session.session_id,
            title=session.title,
            last_message_at=session.last_message_at,
            message_count=session.message_count,
            is_active=session.is_active,
            is_archived=session.is_archived,
            created_at=session.created_at
        ) for session in sessions], total

    def _generate_session_title(self, first_message: str, max_length: int = 50) -> str:
        """Generate a session title from the first message"""
        if len(first_message) <= max_length:
            return first_message
        
        # Find the last space within the limit
        truncated = first_message[:max_length]
        last_space = truncated.rfind(' ')
        
        if last_space > max_length * 0.8:  # If we can get 80% of the desired length
            return truncated[:last_space] + "..."
        else:
            return truncated + "..."

    async def get_session_stats(self, user_id: str) -> Dict[str, Any]:
        """Get user's chat session statistics"""
        total_sessions = self.db.query(ChatSession).filter(ChatSession.user_id == user_id).count()
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