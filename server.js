const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to handle MediaFire downloads
app.get('/api/download', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    if (!url.includes('mediafire.com')) {
      return res.status(400).json({ error: 'URL must be from MediaFire' });
    }

    console.log('Processing URL:', url);

    // Try multiple API endpoints in case one fails
    const apiEndpoints = [
      `https://api.vreden.web.id/api/mediafiredl?url=${encodeURIComponent(url)}`,
      `https://api.nyxs.pw/dl/mediafire?url=${encodeURIComponent(url)}`,
      // Fallback: scrape directly from MediaFire page
    ];

    let fileData = null;
    let apiError = null;

    // Try each API endpoint
    for (const apiUrl of apiEndpoints) {
      try {
        console.log('Trying API:', apiUrl);
        
        const apiResponse = await axios.get(apiUrl, {
          timeout: 10000, // 10 second timeout
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
          timeout: 10000,
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
        timeout: 5000,
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
      // File size will remain 'Unknown'
    }

    res.json({
      success: true,
      fileName,
      fileSize,
      downloadUrl: fileData.link
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to process download request',
      details: error.message
    });
  }
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
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
});
