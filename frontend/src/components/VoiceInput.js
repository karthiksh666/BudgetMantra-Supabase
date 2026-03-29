import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { toast } from 'sonner';

const VoiceInput = ({ onTranscript, placeholder = "Click mic to speak" }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [recognition, setRecognition] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-IN'; // Indian English

      recognitionInstance.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPart = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcriptPart;
          } else {
            interimTranscript += transcriptPart;
          }
        }

        const fullTranscript = finalTranscript || interimTranscript;
        setTranscript(fullTranscript);
        
        if (finalTranscript && onTranscript) {
          onTranscript(finalTranscript);
        }
      };

      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          toast.error('No speech detected. Please try again.');
        } else if (event.error === 'not-allowed') {
          toast.error('Microphone access denied. Please enable it in browser settings.');
        } else {
          toast.error('Voice recognition error. Please try again.');
        }
        setIsListening(false);
      };

      recognitionInstance.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognitionInstance);
    }
  }, [onTranscript]);

  const startListening = () => {
    if (recognition) {
      setTranscript('');
      recognition.start();
      setIsListening(true);
      toast.info('Listening... Speak now');
    } else {
      toast.error('Voice recognition not supported in this browser');
    }
  };

  const stopListening = () => {
    if (recognition) {
      recognition.stop();
      setIsListening(false);
    }
  };

  return (
    <div className="voice-input-container" data-testid="voice-input">
      <div className="voice-input-display">
        {transcript ? (
          <div className="voice-transcript" data-testid="voice-transcript">
            <Volume2 size={18} style={{ marginRight: '8px', color: '#26a69a' }} />
            {transcript}
          </div>
        ) : (
          <div className="voice-placeholder">{placeholder}</div>
        )}
      </div>
      
      <Button
        type="button"
        variant={isListening ? "destructive" : "default"}
        size="icon"
        onClick={isListening ? stopListening : startListening}
        className="voice-button"
        data-testid="voice-button"
      >
        {isListening ? <MicOff size={20} /> : <Mic size={20} />}
      </Button>
    </div>
  );
};

export default VoiceInput;
