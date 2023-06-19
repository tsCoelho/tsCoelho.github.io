import { useReactMediaRecorder } from "react-media-recorder";
import { useEffect } from 'react';
import axios from 'axios'; // to make network request
//import {PressableRecorder} from 'react-native';
import { toast, ToastContainer } from 'react-toastify'; // for toast notification

const RecordView = () => {
  const { status, startRecording, stopRecording, mediaBlobUrl } = useReactMediaRecorder({ audio: true });
  
  const downloadLink = document.getElementById('downloadLink');
  const recordButton = document.getElementById('recordButton');

  const transcribeAudio = async (audioFile) => {

    try {
      const formData = new FormData();
      audioFile && formData.append('file', audioFile);

      const response = await axios.post(`http://localhost:5000/test`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      //setTranscription(response.data.transcription);
      
      toast.info(response.data);
      
      toast.success('Transcription successful.')
    } catch (error) {
      toast.error('An error occurred during transcription.');
    } finally {

    }
  };

    useEffect(() => {
        if(!mediaBlobUrl) return;

        downloadLink.href = mediaBlobUrl;
        downloadLink.download = 'transcribe.mp3';
        

        fetch(mediaBlobUrl)
        .then(response => response.blob())
        .then(blobData => { 

            // Process the audio blob data
            console.log(blobData);

            const reader = new FileReader();
            reader.fileName = 'transcribe.mp3';
            reader.readAsDataURL(blobData);
            reader.onloadend = function () {
              const base64data = reader.result.split(',')[1];
            
              // Send the base64 audio data to the API
              
  
              const apiUrl = 'http://127.0.0.1:5000/test'; // Replace with your API endpoint
  
              fetch(apiUrl, {
                method: 'POST',
                mode: "no-cors",
                mimeType: "application/json",
                headers: {
                  'Content-Type': 'application/json',
                  // Add any additional headers required by the API
                },
                body: JSON.stringify({ audio: base64data }), // Adjust the payload structure as per API requirements
              }).then(data => {
                  // Handle the API response
                  console.log(data);
                  toast.success(data.transcription)
                });
               
              }

        });


        //downloadLink.click();

      }, [mediaBlobUrl]);

      useEffect(() => {
        if(status === 'recording') recordButton.innerText = 'Recording... 🔴';
        if(status === 'stopped') recordButton.innerText = 'Record 🎙';

      }, [status]);

      const handleStartRecording = () => {
        console.log('start recording');
        startRecording();
      }

      const handleStopRecording = () => {
        console.log('stop recording');
        stopRecording();
      }

  return (
    <div>
      <button 
        id="recordButton"
        onTouchStart={handleStartRecording} 
        onMouseDown={handleStartRecording} 
        onMouseUp={handleStopRecording} 
        onTouchEnd={handleStopRecording}>Record 🎙</button>
      <p hidden >{status}</p>
      <p>{mediaBlobUrl}</p>

      <audio hidden src={mediaBlobUrl} controls autoPlay/>
      <a hidden id="downloadLink">Download</a>

    </div>
  );
};
export default RecordView;
