import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
export const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

export const WYSHBONE_SYSTEM_PROMPT = "You are Wyshbone AI. Be concise, practical, UK-focused. When you need data, call tools first.";
