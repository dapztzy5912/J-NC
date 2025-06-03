const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = "8046810663:AAEDKWWGJeCA6us-g0j7RuZniHlKxSLqgSw";

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to handle MediaFire downloads
app.post('/api/download', async (req, res) => {
  try {
    const { url, telegramId } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    if (!telegramId) {
      return res.status(400).json({ error: 'Telegram ID is required' });
    }
    
    if (!url.includes('mediafire.com')) {
      return res.status(400).json({ error: 'URL must be from MediaFire' });
    }

    console.log('Processing URL:', url);
    console.log('Telegram ID:', telegramId);

    // Try multiple API endpoints in case one fails
    const apiEndpoints = [
      `https://api.vreden.web.id/api/mediafiredl?url=${encodeURIComponent(url)}`,
      `https://api.nyxs.pw/dl/mediafire?url=${encodeURIComponent(url)}`,
    ];

    let fileData = null;
    let apiError = null;

    // Try each API endpoint
    for (const apiUrl of apiEndpoints) {
      try {
        console.log('Trying API:', apiUrl);
        
        const apiResponse = await axios.get(apiUrl, {
          timeout: 15000, // 15 second timeout
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        console.log('API Response:', apiResponse.data);
        
        // Handle different API response formats
        if (apiResponse.data.result && apiResponse.data.result.length > 0) {
          // Format 1: vreden API
          fileData = apiResponse.data.result[0];
          break;
        } else if (apiResponse.data.status && apiResponse.data.result) {
          // Format 2: nyxs API
          fileData = {
            nama: apiResponse.data.result.filename,
            link: apiResponse.data.result.link
          };
          break;
        } else if (apiResponse.data.url) {
          // Format 3: direct response
          fileData = {
            nama: apiResponse.data.filename || 'file',
            link: apiResponse.data.url
          };
          break;
        }
      } catch (error) {
        console.log(`API ${apiUrl} failed:`, error.message);
        apiError = error;
        continue;
      }
    }

    // If all APIs failed, try direct scraping as fallback
    if (!fileData) {
      try {
        console.log('Trying direct scraping...');
        const response = await axios.get(url, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });

        const html = response.data;
        
        // Extract download link and filename from HTML
        const downloadLinkMatch = html.match(/href="(https:\/\/download\d+\.mediafire\.com[^"]+)"/);
        const filenameMatch = html.match(/<div class="filename">([^<]+)<\/div>/) || 
                             html.match(/aria-label="Download ([^"]+)"/) ||
                             html.match(/title="([^"]+)"/);

        if (downloadLinkMatch) {
          fileData = {
            nama: filenameMatch ? filenameMatch[1] : 'file',
            link: downloadLinkMatch[1]
          };
        }
      } catch (scrapeError) {
        console.log('Direct scraping failed:', scrapeError.message);
      }
    }

    if (!fileData || !fileData.link) {
      return res.status(404).json({ 
        error: 'File not found or unable to get download link. Please check if the MediaFire link is valid and public.',
        details: apiError?.message
      });
    }

    const fileName = fileData.nama ? decodeURIComponent(fileData.nama) : 'file';
    console.log('File found:', fileName);
    console.log('Download link:', fileData.link);

    // Try to get file size
    let fileSize = 'Unknown';
    try {
      const headResponse = await axios.head(fileData.link, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const contentLength = headResponse.headers['content-length'];
      if (contentLength) {
        fileSize = formatSize(parseInt(contentLength));
      }
    } catch (sizeError) {
      console.log('Could not get file size:', sizeError.message);
    }

    // Send file information to Telegram
    try {
      const telegramMessage = `📁 MediaFire File Information\n\n` +
                             `📋 File Name: ${fileName}\n` +
                             `📏 File Size: ${fileSize}\n` +
                             `🔗 Download Link: ${fileData.link}\n\n` +
                             `✅ File berhasil diproses dan siap untuk didownload!`;

      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: telegramId,
        text: telegramMessage,
        parse_mode: 'HTML'
      });

      console.log('Message sent to Telegram successfully');
      
      res.json({
        success: true,
        message: 'File information sent to your Telegram successfully!',
        fileName,
        fileSize,
        telegramId
      });

    } catch (telegramError) {
      console.error('Telegram error:', telegramError.message);
      
      // Check if it's a user not found error
      if (telegramError.response && telegramError.response.data && 
          telegramError.response.data.description && 
          telegramError.response.data.description.includes('chat not found')) {
        return res.status(400).json({
          error: 'Invalid Telegram ID. Please make sure you have started a conversation with the bot first.',
          details: 'Send any message to the bot @YourBotUsername first, then try again.'
        });
      }
      
      return res.status(500).json({
        error: 'Failed to send message to Telegram',
        details: telegramError.message
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to process download request',
      details: error.message
    });
  }
});

// Endpoint Webhook dari Telegram (optional)
app.post(`/webhook/${TELEGRAM_BOT_TOKEN}`, async (req, res) => {
  const message = req.body.message;
  if (!message || !message.text) return res.sendStatus(200);
  
  const chatId = message.chat.id;
  const text = message.text;
  const userName = message.from.first_name || 'User';
  
  if (text === '/start') {
    const welcomeMessage = `🌟 Selamat datang ${userName}!\n\n` +
                          `🤖 Ini adalah MediaFire Downloader Bot\n` +
                          `📋 Your Telegram ID: ${chatId}\n\n` +
                          `💡 Cara menggunakan:\n` +
                          `1. Buka website MediaFire Downloader\n` +
                          `2. Masukkan link MediaFire\n` +
                          `3. Masukkan Telegram ID Anda: ${chatId}\n` +
                          `4. Klik Download\n` +
                          `5. File info akan dikirim ke chat ini\n\n` +
                          `✨ Selamat menggunakan!`;
    
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: welcomeMessage
    });
  } else if (text === '/id') {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: `📋 Your Telegram ID: ${chatId}`
    });
  }
  
  res.sendStatus(200);
});

// Helper function to format file size
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Telegram Bot Token:', TELEGRAM_BOT_TOKEN ? 'Configured' : 'Not configured');
});
