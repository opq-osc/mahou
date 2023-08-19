import express from 'express'
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import dayjs from 'dayjs'
import { getAllData } from './data'
import nodeHtmlToImage from 'node-html-to-image'
import { pngQuantize } from '@napi-rs/image'

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

let isRunning = false

const run = async () => {
  const compress = async () => {
    if (!existsSync(outputPath)) {
      console.error(`${pluginName}: compress failed, file not found`)
      return
    }
    console.log(`${pluginName}: trigger compress`)
    const fileBuffer = readFileSync(outputPath)
    const compressedBuffer = await pngQuantize(fileBuffer, {
      maxQuality: 80,
    })
    console.log(`${pluginName}: trigger compress success`)
    console.log(`${pluginName}: write file`)
    writeFileSync(outputPath, compressedBuffer)
  }
  const render = async (day: string, needCompress = false) => {
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

    // TODO: pm2
    if (isRunning) {
      return
    }
    isRunning = true
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
    isRunning = false

    if (needCompress) {
      await compress()
    }
    return buffer
  }

  const getDayMark = () => {
    return dayjs().format('ddd').toLowerCase()
  }
  const useGenerate = process.argv.includes('--generate')
  if (useGenerate){
    const useCompress = process.argv.includes('--compress')
    console.log(`${pluginName}: generate mode`)
    const mark = getDayMark()
    try {
      console.log(`${pluginName}: trigger render`)
      await render(mark, useCompress)
      console.log(`${pluginName}: render success for ${mark}`)
    } catch (e) {
      console.error(`${pluginName}: render failed for ${mark}`)
      console.error(e)
      return
    }
    return
  }

  const app = express()
  app.get(`/api/v1/dayNews`, async (req, res) => {
    try {
      console.log(`${pluginName}: trigger render`)
      const mark = getDayMark()
      const useCompress = !!req.query?.compress?.length
      const buffer = await render(mark, useCompress)
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
