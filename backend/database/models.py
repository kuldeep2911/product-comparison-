"""
Database ORM models.
Re-exports existing ETL models and defines new chat-related models.
"""
import os
import sys
import importlib.util

# Load the existing ETL models module directly by path to avoid circular imports
# (both backend/ and ETL module have database/models.py)
_ETL_MODELS_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data cleaning and storing in database", "database", "models.py")
)

# We need the ETL config on path for the ETL models module to load its dependencies
_ETL_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data cleaning and storing in database")
)
if _ETL_ROOT not in sys.path:
    sys.path.append(_ETL_ROOT)

spec = importlib.util.spec_from_file_location("etl_models", _ETL_MODELS_PATH)
if spec is None:
    raise ImportError(f"Could not load ETL models from {_ETL_MODELS_PATH}")
_etl_models = importlib.util.module_from_spec(spec)
if spec.loader is None:
    raise ImportError(f"No loader found for ETL models at {_ETL_MODELS_PATH}")
spec.loader.exec_module(_etl_models)

# Re-export all existing models
Base = _etl_models.Base
Category = _etl_models.Category
Brand = _etl_models.Brand
Product = _etl_models.Product
SpecSection = _etl_models.SpecSection
SpecField = _etl_models.SpecField
ProductSpecValue = _etl_models.ProductSpecValue
ProductNumericSpec = _etl_models.ProductNumericSpec
ProductFeature = _etl_models.ProductFeature
UseCaseWeight = _etl_models.UseCaseWeight

# New chat models
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, 
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    is_active = Column(Integer, default=1)

    def __repr__(self):
        return f"<User(username='{self.username}')>"


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=True)
    mode = Column(String(50), default="compare_specific")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")
    context = relationship("ChatContext", back_populates="session", uselist=False, cascade="all, delete-orphan")
    interactions = relationship("UserInteraction", back_populates="session", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ChatSession(id={self.id}, mode='{self.mode}')>"


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"))
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    metadata_ = Column("metadata", JSONB, default={})
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("ChatSession", back_populates="messages")

    def __repr__(self):
        return f"<ChatMessage(role='{self.role}', content='{self.content[:30]}...')>"


class ChatContext(Base):
    __tablename__ = "chat_context"

    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), primary_key=True)
    selected_products = Column(ARRAY(Integer), default=[])
    selected_category = Column(Text, nullable=True)
    filters = Column(JSONB, default={})
    budget = Column(Integer, nullable=True)
    use_case = Column(Text, nullable=True)
    last_query = Column(Text, nullable=True)

    session = relationship("ChatSession", back_populates="context")

    def __repr__(self):
        return f"<ChatContext(session={self.session_id}, products={self.selected_products})>"


class UserInteraction(Base):
    __tablename__ = "user_interactions"

    id = Column(Integer, primary_key=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"))
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"))
    interaction_type = Column(String(50), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("ChatSession", back_populates="interactions")

    def __repr__(self):
        return f"<UserInteraction(type='{self.interaction_type}', product={self.product_id})>"
