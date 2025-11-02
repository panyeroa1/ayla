// FIX: Removed invalid file headers.
import { FunctionDeclaration } from '@google/genai';

export interface ConversationTurn {
  speaker: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
}

export interface ServerSettings {
  googleCloudProjectId: string;
  googleCloudServiceAccountJson: string;
  twilioSid: string;
  twilioAuthToken: string;
  blandApiKey: string;
  cartesiaApiKey: string;
  elevenLabsApiKey: string;
  ollamaCloudEndpoint: string;
  ollamaCloudApiKey: string;
}

export interface GenerateImageSettings {
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
}

export interface ToolSettings {
  generateImage?: GenerateImageSettings;
}

export interface AppSettings {
  systemInstruction: string;
  voice: string;
  language: string;
  rate: number;
  pitch: number;
  enabledTools: string[];
  noiseCancellation: boolean;
  serverSettings: ServerSettings;
  toolSettings: ToolSettings;
}

export interface Tool {
  name: string;
  description: string;
  configurable?: boolean;
  functionDeclaration?: FunctionDeclaration;
}

export interface ActiveToolCall {
  name: string;
  args: any;
}

// Workspace State Types
export type WorkspaceMode = 'idle' | 'action_select' | 'upload' | 'processing' | 'result' | 'api_key_needed' | 'recording' | 'screen_sharing_setup';

export type UploadAction = 'analyzeImage' | 'editImage' | 'generateVideo' | 'transcribeAudio' | 'analyzeTradingData';
export type MediaAction = UploadAction | 'recordMedia' | 'recordScreen';


export interface GroundingSource {
  uri: string;
  title: string;
}

export interface WorkspaceContent {
  type: 'image' | 'video' | 'text' | 'grounding_search' | 'grounding_maps' | 'code';
  data: any; // URL for image/video, text string, GroundingSource[], or { text: string; language: string } for code
  prompt?: string; // Original prompt that generated the content
}

export interface ToolOutput {
  id: string;
  toolName: string;
  content: WorkspaceContent;
}

export interface WorkspaceState {
  mode: WorkspaceMode;
  primaryContent: WorkspaceContent | null;
  toolOutputs: ToolOutput[];
  message: string;
  uploadAction?: UploadAction;
}

// Dialer Page Types
export type CallState = 'keypad' | 'ringing' | 'connected' | 'on-hold' | 'summary';

export interface CallTranscriptEntry {
  speaker: 'ivr' | 'agent' | 'user' | 'system';
  text: string;
}

export type CallType = 'outgoing' | 'incoming' | 'missed';

export interface CallHistoryEntry {
  id: string;
  contactName: string;
  number: string;
  type: CallType;
  timestamp: number; // Date.now()
  duration: number; // in seconds
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  number: string;
}