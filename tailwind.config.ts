import type { Config } from 'tailwindcss'
const config: Config = { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'], theme: { extend: { colors: { ink: '#17211f', leaf: '#1d6f5b', mint: '#dff4ec', amber: '#b7791f', danger: '#b42318', panel: '#f7faf8' } } }, plugins: [] }
export default config
