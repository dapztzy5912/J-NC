        document.addEventListener('DOMContentLoaded', function() {
            const downloadBtn = document.getElementById('download-btn');
            const mediafireUrl = document.getElementById('mediafire-url');
            const telegramId = document.getElementById('telegram-id');
            const loading = document.getElementById('loading');
            const result = document.getElementById('result');
            const fileInfo = document.getElementById('file-info');
            const fileName = document.getElementById('file-name');
            const fileSize = document.getElementById('file-size');
            const sentTelegramId = document.getElementById('sent-telegram-id');
            
            downloadBtn.addEventListener('click', async function() {
                const url = mediafireUrl.value.trim();
                const tgId = telegramId.value.trim();
                
                if (!url) {
                    showResult('❌ Silakan masukkan URL MediaFire', 'error');
                    return;
                }
                
                if (!tgId) {
                    showResult('❌ Silakan masukkan Telegram ID Anda', 'error');
                    return;
                }
                
                if (!url.includes('mediafire.com')) {
                    showResult('❌ URL harus dari MediaFire', 'error');
                    return;
                }
                
                if (!/^\d+$/.test(tgId)) {
                    showResult('❌ Telegram ID harus berupa angka', 'error');
                    return;
                }
                
                try {
                    loading.style.display = 'block';
                    downloadBtn.disabled = true;
                    result.style.display = 'none';
                    fileInfo.style.display = 'none';
                    
                    const response = await fetch('/api/download', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            url: url,
                            telegramId: tgId
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (!response.ok) {
                        throw new Error(data.error || 'Gagal memproses file');
                    }
                    
                    if (data.fileName) {
                        fileName.textContent = data.fileName;
                        fileSize.textContent = data.fileSize || 'Unknown';
                        sentTelegramId.textContent = data.telegramId;
                        fileInfo.style.display = 'block';
                    }
                    
                    loading.style.display = 'none';
                    showResult('✅ ' + data.message, 'success');
                    
                } catch (error) {
                    console.error(error);
                    loading.style.display = 'none';
                    showResult('❌ Error: ' + (error.message || 'Gagal memproses download'), 'error');
                } finally {
                    downloadBtn.disabled = false;
                }
            });
            
            function showResult(message, type) {
                result.textContent = message;
                result.className = type;
                result.style.display = 'block';
            }
            
            mediafireUrl.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    downloadBtn.click();
                }
            });
            
            telegramId.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    downloadBtn.click();
                }
            });
        });
