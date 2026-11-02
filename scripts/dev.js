import { spawn } from 'node:child_process'

const services = ['services/auth/index.js', 'services/clinic/index.js', 'services/notification/index.js', 'gateway/index.js']
const children = services.map(file => spawn(process.execPath, [file], { stdio: 'inherit', env: process.env }))

function stop() {
  for (const child of children) child.kill('SIGTERM')
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const child of children) child.on('exit', code => {
  if (code) {
    stop()
    process.exitCode = code
  }
})
