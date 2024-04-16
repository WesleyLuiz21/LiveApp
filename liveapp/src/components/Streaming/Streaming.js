import React from 'react';

// Placeholder for the video stream
function Streaming({ streamUrl }) {
    return (
        <div className="streaming-container"> 
            <video controls autoPlay={true} style={{ width: '100%' }}>
                <source src={streamUrl} type="video/mp4" />
                Your browser does not support the video tag.
            </video>
        </div>
    );
}

export default Streaming;
