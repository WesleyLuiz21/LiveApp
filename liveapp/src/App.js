import React from 'react';
import './App.css';
import Streaming from './components/Streaming/Streaming';
import Livechat from './components/livechat/Livechat';

function App() {
    const streamUrl = 'http://example.com/stream'; //actual streaming URL

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
