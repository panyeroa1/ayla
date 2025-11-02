// FIX: Removed invalid file headers.
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenaiBlob } from '@google/genai';
import { XMarkIcon, MicrophoneIcon } from './icons';
import { encode } from '../services/audioUtils';

interface FeedbackProps {
  onClose: () => void;
  onSubmit: (feedback: string) => void;
}

// A simplified logic for live transcription
const useLiveTranscription = (onTranscript: (text: string) => void, onRecordingStateChange: (isRecording: boolean) => void, onError: (error: string) => void) => {
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const micProcessorNodeRef = useRef<ScriptProcessorNode | null>(null);
    const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

    const stopRecording = useCallback(() => {
        sessionPromiseRef.current?.then(session => session.close());
        sessionPromiseRef.current = null;
        micStreamRef.current?.getTracks().forEach(track => track.stop());
        micProcessorNodeRef.current?.disconnect();
        micSourceNodeRef.current?.disconnect();
        if (inputAudioContextRef.current?.state !== 'closed') {
           inputAudioContextRef.current?.close().then(() => inputAudioContextRef.current = null);
        }
        onRecordingStateChange(false);
    }, [onRecordingStateChange]);

    const startRecording = useCallback(async () => {
        try {
            onRecordingStateChange(true);
            onError('');
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            if (!inputAudioContextRef.current || inputAudioContextRef.current.state === 'closed') {
                inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            }
            inputAudioContextRef.current.resume();

            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                noiseSuppression: true,
                echoCancellation: true,
                autoGainControl: true,
              },
            });
            micStreamRef.current = stream;

            const callbacks = {
                onopen: () => {
                    const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                    micSourceNodeRef.current = source;
                    const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                    micProcessorNodeRef.current = scriptProcessor;

                    scriptProcessor.onaudioprocess = (event) => {
                        const inputData = event.inputBuffer.getChannelData(0);
                        const pcmBlob: GenaiBlob = {
                            data: encode(new Uint8Array(new Int16Array(inputData.map(v => v * 32768)).buffer)),
                            mimeType: 'audio/pcm;rate=16000',
                        };
                        sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContextRef.current!.destination);
                },
                onmessage: (message: LiveServerMessage) => {
                    if (message.serverContent?.inputTranscription) {
                        onTranscript(message.serverContent.inputTranscription.text);
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error('Live transcription error:', e);
                    onError('An error occurred during transcription.');
                    stopRecording();
                },
                onclose: () => {
                    if(sessionPromiseRef.current) {
                       stopRecording();
                    }
                },
            };

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks,
                config: {
                    responseModalities: [Modality.AUDIO], // Required, but we'll ignore audio output
                    inputAudioTranscription: {},
                },
            });
            await sessionPromiseRef.current;
        } catch (error) {
            console.error("Failed to start transcription session:", error);
            onError('Could not access microphone. Please check permissions.');
            onRecordingStateChange(false);
            stopRecording();
        }
    }, [onTranscript, stopRecording, onRecordingStateChange, onError]);

    return { startRecording, stopRecording };
};


export const Feedback: React.FC<FeedbackProps> = ({ onClose, onSubmit }) => {
  const [feedbackText, setFeedbackText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState('');
  const currentTranscriptionRef = useRef('');

  const handleTranscript = useCallback((text: string) => {
    currentTranscriptionRef.current += text;
    setFeedbackText(currentTranscriptionRef.current);
  }, []);
  
  const handleRecordingStateChange = (recording: boolean) => {
    if (!recording) { // When recording stops
      currentTranscriptionRef.current = feedbackText;
    } else { // When recording starts
      currentTranscriptionRef.current = feedbackText; 
    }
    setIsRecording(recording);
  };
  
  const { startRecording, stopRecording } = useLiveTranscription(handleTranscript, handleRecordingStateChange, setError);

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };
  
  // Ensure recording stops when component unmounts
  useEffect(() => {
    return () => stopRecording();
  }, [stopRecording]);

  const handleSubmit = () => {
    if (feedbackText.trim()) {
      onSubmit(feedbackText);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-40 flex items-center justify-center animate-fade-in-tool">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md shadow-2xl text-white relative flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-neutral-700">
          <h2 className="text-lg font-semibold">Send Feedback</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-neutral-700">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-neutral-400 mb-4">
            We'd love to hear your thoughts! What do you like? What could be improved? You can type or record your feedback.
          </p>
          <textarea
            rows={5}
            className="w-full bg-neutral-800 border border-neutral-600 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder={isRecording ? "Listening..." : "Your feedback..."}
            value={feedbackText}
            onChange={(e) => {
              if(!isRecording) {
                setFeedbackText(e.target.value)
                currentTranscriptionRef.current = e.target.value;
              }
            }}
            autoFocus
            readOnly={isRecording}
          />
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>
        <div className="flex justify-between items-center p-4 gap-2 border-t border-neutral-700 bg-neutral-900/50 rounded-b-2xl">
          <button
            onClick={handleToggleRecording}
            className={`p-2 rounded-full transition-colors ${isRecording ? 'bg-red-600/20 text-red-400 animate-pulse' : 'hover:bg-neutral-700'}`}
            aria-label={isRecording ? "Stop recording" : "Record feedback"}
          >
            <MicrophoneIcon className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-md hover:bg-neutral-700 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!feedbackText.trim() || isRecording}
              className="text-sm px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-600 disabled:text-neutral-400 disabled:cursor-not-allowed transition-colors"
            >
              Submit
            </button>
          </div>
        </div>
      </div>
       <style>{`
        .animate-fade-in-tool {
          animation: fadeInTool 0.2s ease-in-out;
        }
        @keyframes fadeInTool {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};
