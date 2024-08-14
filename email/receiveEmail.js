const axios = require('axios');
require('dotenv').config();

async function fetchEmails() {
    try {
        const response = await axios.get(`https://mailtrap.io/api/v1/inboxes/${process.env.MAILTRAP_INBOX_ID}/messages`, {
            headers: {
                'Api-Token': process.env.MAILTRAP_API_TOKEN
            }
        });

        return response.data;
    } catch (error) {
        console.error('Error fetching emails:', error);
        return [];
    }
}

module.exports = fetchEmails;
