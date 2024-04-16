import React from 'react';
import './App.css';
import Streaming from './components/Streaming/Streaming';
import Livechat from './components/livechat/Livechat';

function App() {
    const streamUrl = 'https://06c95fabdd6a.eu-west-1.playback.live-video.net/api/video/v1/eu-west-1.637423269549.channel.uoV4etCJXJtv.m3u8'; //actual streaming URL from amazon

    return (
        <div className="App">
            <header className="App-header">
                <h1>Welcome to Our Streaming Platform</h1>
            </header>
            <Streaming streamUrl={streamUrl} />
            <Livechat />
        </div>
    );
}

export default App;
