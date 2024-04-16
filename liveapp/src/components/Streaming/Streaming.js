import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';

function Streaming({ streamUrl }) {
    const videoRef = useRef(null);
    const hlsRef = useRef(null);  // Create a ref to store the Hls instance

    useEffect(() => {
        if (Hls.isSupported()) {
            // Only create a new Hls instance if one does not already exist
            if (!hlsRef.current) {
                const hls = new Hls();
                hlsRef.current = hls;  // Store the Hls instance in the ref
                hls.loadSource(streamUrl);
                hls.attachMedia(videoRef.current);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    videoRef.current.play();
                });
            } else {
                // If an Hls instance exists, just change the source
                hlsRef.current.loadSource(streamUrl);
                hlsRef.current.attachMedia(videoRef.current);
            }

            return () => {
                // Destroy the Hls instance when the component unmounts or the source changes
                if (hlsRef.current) {
                    hlsRef.current.destroy();
                    hlsRef.current = null;  // Ensure to clean up the ref
                }
            };
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            // Fallback for native playback when HLS is directly supported
            videoRef.current.src = streamUrl;
            videoRef.current.addEventListener('loadedmetadata', () => {
                videoRef.current.play();
            });

            return () => {
                videoRef.current.removeAttribute('src'); // Cleanup src when component unmounts or source changes
                videoRef.current.load();
            };
        }
    }, [streamUrl]);

    return <video ref={videoRef} controls style={{ width: '100%' }} />;
}

export default Streaming;
