import React from 'react';

function Streaming({ streamUrl }) {
    return (
        <div className="streaming-container">
            <video controls autoPlay={true} style={{ width: '100%' }}>
                <source src={streamUrl} type="application/vnd.apple.mpegurl" />
                Your browser does not support the video tag.
            </video>
        </div>
    );
}

export default Streaming;
