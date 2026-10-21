import React from 'react'
import { renderToString } from 'react-dom/server'
import App from '../src/App'

const html = renderToString(<App />)
if (!html.includes('小猫回家记') || !html.includes('XSOLLA') || !html.includes('开始冒险') || !html.includes('viewBox="0 0 100 100"')) {
  throw new Error('首屏关键 UI 未成功渲染')
}
console.log(`SSR_OK ${html.length} chars`)
