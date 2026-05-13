import sys
from config.database import SessionLocal
import services.conversation_manager as cm
import services.ranking_engine as re

print('CM:', cm.__file__)
print('RE:', re.__file__)
