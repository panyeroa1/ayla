// FIX: Removed invalid file header.
import { GoogleGenAI, LiveCallbacks, Modality, FunctionDeclaration, GenerateContentResponse } from '@google/genai';
import { ALL_TOOLS } from '../constants/tools';
import { AppSettings } from '../types';

let ai: GoogleGenAI;

function getAiInstance(): GoogleGenAI {
  if (!ai) {
    if (!process.env.API_KEY) {
      throw new Error("API_KEY environment variable not set");
    }
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return ai;
}

// Live Session
export function startLiveSession(settings: AppSettings, callbacks: LiveCallbacks): Promise<any> {
  const ai = getAiInstance();
  
  const functionDeclarations: FunctionDeclaration[] = ALL_TOOLS
    .filter(tool => settings.enabledTools.includes(tool.name) && tool.functionDeclaration)
    .map(tool => tool.functionDeclaration!);

  // Refactored Tool Configuration for stability
  const toolConfig: any = {};
  if (functionDeclarations.length > 0) {
    toolConfig.functionDeclarations = functionDeclarations;
  }
  if (settings.enabledTools.includes('groundedSearch')) {
    toolConfig.googleSearch = {};
  }
  if (settings.enabledTools.includes('groundedMapSearch')) {
    toolConfig.googleMaps = {};
  }

  const tools = Object.keys(toolConfig).length > 0 ? [toolConfig] : undefined;

  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voice as any } },
      },
      systemInstruction: settings.systemInstruction,
      tools: tools,
      outputAudioTranscription: {},
      inputAudioTranscription: {},
    },
  });
}


// Image Generation
export async function generateImage(prompt: string, aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' = '1:1'): Promise<string> {
    const ai = getAiInstance();
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: aspectRatio,
        },
    });
    const base64ImageBytes = response.generatedImages[0].image.imageBytes;
    return `data:image/jpeg;base64,${base64ImageBytes}`;
}

// Image Editing
export async function editImage(imageBase64: string, mimeType: string, prompt: string): Promise<string> {
    const ai = getAiInstance();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [
                { inlineData: { data: imageBase64, mimeType } },
                { text: prompt },
            ],
        },
        config: { responseModalities: [Modality.IMAGE] },
    });
    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part?.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
    throw new Error('No image was edited or returned.');
}

// Image Understanding
export async function analyzeImage(imageBase64: string, mimeType: string, prompt: string): Promise<string> {
    const ai = getAiInstance();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }] },
    });
    return response.text;
}

// Video Generation
export async function generateVideo(
    imageBase64: string,
    mimeType: string,
    prompt: string,
    aspectRatio: '16:9' | '9:16',
    onProgress: (status: string) => void
): Promise<string> {
    
    onProgress('Checking API Key...');
    if (typeof (window as any).aistudio?.hasSelectedApiKey !== 'function') {
      throw new Error("Veo requires API key selection. Please run in the correct environment.");
    }

    const keySelected = await (window as any).aistudio.hasSelectedApiKey();
    if (!keySelected) {
        throw new Error('API_KEY_REQUIRED');
    }
    
    // Re-create instance to ensure latest key is used.
    const videoAi = new GoogleGenAI({ apiKey: process.env.API_KEY });

    onProgress('Starting video generation...');
    let operation = await videoAi.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt,
        image: { imageBytes: imageBase64, mimeType },
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio },
    });

    onProgress('Processing video... this may take a few minutes.');
    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        try {
            operation = await videoAi.operations.getVideosOperation({ operation: operation });
        } catch (e: any) {
            if (e.message?.includes("Requested entity was not found")) {
                 throw new Error('API_KEY_REQUIRED');
            }
            throw e; // rethrow other errors
        }
        onProgress(`Video processing state: ${operation.metadata?.state || 'IN_PROGRESS'}`);
    }

    onProgress('Fetching video data...');
    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
        throw new Error('Video generation finished, but no download link was provided.');
    }

    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const videoBlob = await response.blob();
    return URL.createObjectURL(videoBlob);
}


// Grounding
export async function generateTextWithGoogleSearch(prompt: string): Promise<GenerateContentResponse> {
    const ai = getAiInstance();
    return ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
    });
}

export async function generateTextWithGoogleMaps(prompt: string): Promise<GenerateContentResponse> {
    const ai = getAiInstance();
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
    });
    
    return ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            tools: [{ googleMaps: {} }],
            toolConfig: {
                retrievalConfig: {
                    latLng: {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    }
                }
            }
        },
    });
}

// Low-latency Text
export async function generateLowLatencyText(prompt: string): Promise<string> {
    const ai = getAiInstance();
    const response = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: prompt,
    });
    return response.text;
}

// Complex Text Generation (for Code, Docs, etc.)
export async function generateProText(prompt: string): Promise<string> {
    const ai = getAiInstance();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
    });
    return response.text;
}

// Text Summarization
export async function summarizeText(text: string): Promise<string> {
    const ai = getAiInstance();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: text,
        config: {
            systemInstruction: 'You are an expert at summarizing text. Provide a concise and clear summary of the provided content.',
        },
    });
    return response.text;
}

// Audio Transcription
export async function transcribeAudio(audioBase64: string, mimeType: string, prompt: string): Promise<string> {
    const ai = getAiInstance();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [
            { inlineData: { data: audioBase64, mimeType } },
            { text: prompt },
        ] },
    });
    return response.text;
}

// Data Analysis Sub-Agent
export async function analyzeTradingDataWithFlash(tradingData: string, analysisPrompt: string): Promise<string> {
    const ai = getAiInstance();
    const systemInstruction = `You are a quantitative analyst. Your task is to analyze the provided trading data and answer the user's question. Provide a clear, data-driven response, focusing on probabilities and statistical insights. The data is from MT4/MT5 trading history.`;
    const fullPrompt = `User's question: "${analysisPrompt}"\n\nTrading Data:\n\`\`\`\n${tradingData}\n\`\`\``;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
        config: {
            systemInstruction,
        }
    });
    return response.text;
}