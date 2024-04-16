import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';

// hls library is used to pass the stream onto the application
// without hls the CORS policy blocks the request to the application.

function Streaming({ streamUrl }) {
    const videoRef = useRef(null);

    useEffect(() => {
        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(streamUrl);
            hls.attachMedia(videoRef.current);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoRef.current.play();
            });

            return () => hls.destroy();
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            videoRef.current.src = streamUrl;
            videoRef.current.addEventListener('loadedmetadata', () => {
                videoRef.current.play();
            });
        }
    }, [streamUrl]);

    return <video ref={videoRef} controls style={{ width: '100%' }} />;
}

export default Streaming;

