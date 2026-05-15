import winston from 'winston'

const { combine, timestamp, colorize, printf, json } = winston.format

// Console format for development
const devFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : ''
  return `${timestamp} [${level}]: ${message}${metaStr}`
})

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })),
  transports: [
    // Console — always on
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        process.env.NODE_ENV === 'production' ? json() : devFormat
      ),
    }),
    // File — errors only
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(timestamp(), json()),
    }),
    // File — all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: combine(timestamp(), json()),
    }),
  ],
})

export default logger
