// services/googleSheetsService.js
import { google } from 'googleapis'

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})

const SHEET_ID = process.env.GOOGLE_SHEET_ID  // from the sheet URL

export async function appendLeadToSheet(lead) {
  try {
    const sheets = google.sheets({ version: 'v4', auth })

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          new Date().toLocaleString('en-IN'),  // Date
          lead.name,
          lead.phone,
          lead.email,
          lead.goal || '',
          lead.available_time || '',
          'New',                               // Status
          '',                                  // Notes (owner fills this)
        ]],
      },
    })
    console.log('Lead added to Google Sheet')
  } catch (err) {
    // Never crash the main request if sheets fails
    console.error('Google Sheets error:', err)
  }
}
