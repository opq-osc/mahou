import express from 'express'
import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import dayjs from 'dayjs'
import { getAllData } from './data'
import nodeHtmlToImage from 'node-html-to-image'

const htmlPath = join(__dirname, './index.html')
const outputPath = join(__dirname, './output.png')
const pluginName = 'mahou'
const bangumiPath = join(__dirname, './bangumi.json')
if (!existsSync(bangumiPath)) {
  throw new Error(
    'bangumi.json not found, please run pnpm sync:bgm for generate'
  )
}
const bangumi = JSON.parse(readFileSync(bangumiPath, 'utf-8')) as Record<
  string,
  any
>

const run = async () => {
  const render = async (day: string) => {
    // if create time is today, use cache
    if (existsSync(outputPath)) {
      const stats = statSync(outputPath)
      const latestUpdateTimeIns = dayjs(stats.mtimeMs)
      const currentIns = dayjs()
      // 60 minutes
      if (currentIns.diff(latestUpdateTimeIns, 'minute') < 60) {
        console.log(`${pluginName}: use output cache for ${day}`)
        return readFileSync(outputPath)
      }
    }

    console.log(`${pluginName}: get all remote data`)
    const remoteData = await getAllData()
    console.log(`${pluginName}: get all remote data success`)

    console.log(`${pluginName}: render for ${day}`)

    const buffer = await nodeHtmlToImage({
      html: readFileSync(htmlPath, 'utf-8')
        .replace('{{renderTemplate}}', JSON.stringify('dayNews'))
        .replace(
          '{{renderData}}',
          JSON.stringify({
            timestamp: dayjs().valueOf(),
            bilibiliHotTopic: remoteData.bili,
            currentDayNewBangumi: bangumi[day],
            techNews: remoteData.tech,
            gameNews: remoteData.game,
            hitokoto: remoteData.hitokoto,
          })
        )
        .replace('{{bodyHeight}}', `2180`)
        .replace('{{bodyWidth}}', `780`),
      output: outputPath,
      timeout: 60 * 1e3,
      puppeteerArgs: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: {
          width: 780,
          height: 2180,
          deviceScaleFactor: 2,
        },
      },
    })
    console.log(`${pluginName}: render over for ${day}`)
    return buffer
  }

  if (process.argv.includes('--generate')){
    const mark = dayjs().format('ddd').toLowerCase()
    await render(mark)
    return
  }

  const app = express()
  app.get(`/api/v1/dayNews`, async (req, res) => {
    try {
      console.log(`${pluginName}: trigger render`)
      const mark = dayjs().format('ddd').toLowerCase()
      const buffer = await render(mark)
      if (!buffer || !existsSync(outputPath)) {
        console.error(`${pluginName}: render failed for ${mark}`)
        throw new Error('render failed')
      }
      console.log(`${pluginName}: render success for ${mark}`)
      const base64 = buffer.toString('base64')
      res.send({
        code: 0,
        data: {
          base64,
        },
      })
    } catch {
      res.send({
        code: 1,
        msg: 'render error',
      })
    }
  })
  const port = process.env.PORT || 9528
  app.listen(port, () => {
    console.log(`mahou server started at ${port}`)
    console.log(`api point: http://localhost:${port}/api/v1/dayNews`)
  })
}

run()
