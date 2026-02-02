"""
Minimal test to check if OpenAIChat is recognized as a Model instance.
Run this file: python test_model.py
"""

from agno.models.openai import OpenAIChat
from agno.models.base import Model
from agno.agent import Agent

# Create an OpenAIChat instance
model = OpenAIChat(id="gpt-4o")

print("--- Model Instance Check ---")
print(f"Model instance: {model}")
print(f"Type: {type(model)}")
print(f"Is instance of Model (from agno.models.base): {isinstance(model, Model)}")
print(f"Model.__class__.__mro__: {type(model).__mro__}")

# Check if Agent import brings a different Model class
from agno.agent.agent import Model as AgentModel
print(f"\n--- Model Class Comparison ---")
print(f"agno.models.base.Model: {Model}")
print(f"agno.agent.agent.Model (if imported there): {AgentModel}")
print(f"Are they the same class? {Model is AgentModel}")

# Try to create an Agent with this model
print("\n--- Creating Agent ---")
try:
    agent = Agent(model=model, description="Test Agent")
    print("SUCCESS: Agent created successfully!")
    print(f"Agent: {agent}")
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
