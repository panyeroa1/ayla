// FIX: Removed invalid file header.
import { FunctionDeclaration, Type } from '@google/genai';
import { Tool } from '../types';

export const ALL_TOOLS: Tool[] = [
  {
    name: 'generateImage',
    description: 'Generate an image based on a user prompt.',
    configurable: true,
    functionDeclaration: {
      name: 'generateImage',
      description: 'Generates an image from a textual prompt. Returns the image URL.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          prompt: {
            type: Type.STRING,
            description: 'A detailed description of the image to generate.',
          },
          aspectRatio: {
            type: Type.STRING,
            description: 'The desired aspect ratio for the image. Can be "1:1", "16:9", "9:16", "4:3", or "3:4". Defaults to "1:1".',
            enum: ["1:1", "16:9", "9:16", "4:3", "3:4"],
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    name: 'generateProText',
    description: 'Use a more powerful model for complex text generation tasks like creating documents or code.',
    functionDeclaration: {
      name: 'generateProText',
      description: 'Generates text using the gemini-2.5-pro model for complex tasks.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          prompt: {
            type: Type.STRING,
            description: 'The prompt for the text generation task.',
          },
          language: {
            type: Type.STRING,
            description: 'Optional: The programming language if generating code (e.g., "python", "javascript").',
          },
        },
        required: ['prompt'],
      }
    },
  },
  {
    name: 'analyzeTradingData',
    description: 'Analyzes trading data (e.g., from MT4/MT5) to calculate probabilities and provide insights.',
    functionDeclaration: {
      name: 'analyzeTradingData',
      description: 'Performs data analysis on a provided string of trading data using a specialized sub-agent.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          tradingData: {
            type: Type.STRING,
            description: 'The trading data, typically in CSV or text format.',
          },
          analysisPrompt: {
            type: Type.STRING,
            description: 'The specific question or analysis to perform on the data (e.g., "What is the probability of the next trade being profitable?").',
          },
        },
        required: ['tradingData', 'analysisPrompt'],
      },
    },
  },
  {
    name: 'generateFastText',
    description: 'Use a fast, low-latency model for quick questions and simple text generation.',
    functionDeclaration: {
      name: 'generateFastText',
      description: 'Generates text using the gemini-flash-lite-latest model for low-latency responses.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          prompt: {
            type: Type.STRING,
            description: 'The prompt for the text generation task.',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    name: 'groundedSearch',
    description: 'Perform a Google Search to answer questions about recent events or provide up-to-date information.',
  },
  {
    name: 'groundedMapSearch',
    description: 'Perform a Google Maps search to find information about places.',
  },
  {
    name: 'summarizeText',
    description: 'Generates a concise summary of a given block of text.',
    functionDeclaration: {
      name: 'summarizeText',
      description: 'Summarizes a long piece of text into a few key points or paragraphs.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          text: {
            type: Type.STRING,
            description: 'The block of text that needs to be summarized.',
          },
        },
        required: ['text'],
      },
    },
  },
];