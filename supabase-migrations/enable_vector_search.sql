-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Add embedding column to questions table
-- We use 1536 dimensions for OpenAI text-embedding-3-small
alter table questions 
add column if not exists embedding vector(1536);

-- Create an HNSW index for fast similarity search using cosine distance
-- This is crucial for performance once we have many questions
create index on questions using hnsw (embedding vector_cosine_ops);
