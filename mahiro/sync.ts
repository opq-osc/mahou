import 'zx/globals'
import cheerio from 'cheerio'
import { join } from 'path'

const run = async () => {
  const getHtml = async () => {
    const cachePath = join(__dirname, './cache.html')
    if (fs.existsSync(cachePath)) {
      return fs.readFileSync(cachePath, 'utf-8')
    }
    const url = `https://bangumi.tv/calendar`
    const html = await (await fetch(url)).text()
    fs.writeFileSync(cachePath, html, 'utf-8')
    return html
  }
  const html = await getHtml()

  const selector = {
    sun: 'dd.Sun',
    mon: 'dd.Mon',
    tue: 'dd.Tue',
    wed: 'dd.Wed',
    thu: 'dd.Thu',
    fri: 'dd.Fri',
    sat: 'dd.Sat',
  }
  const result = {
    sun: [],
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
  }
  const html$ = cheerio.load(html)
  Object.keys(selector).forEach((key) => {
    const list = html$(`${(selector as any)[key]} ul li`)
    list.each((_, element) => {
      const cnTitle = html$(element).find('div div :nth-child(1) a')?.text().trim()
      const jpTitle = html$(element).find('div div :nth-child(2) a')?.text().trim()
      const title = cnTitle || jpTitle
      const bg = element.attribs.style
      const extractBg = bg.match(/background:url\('(.*?)'\)/)?.[1]
      const urlWithoutProtocol = extractBg?.replace(
        'lain.bgm.tv/pic/cover/c',
        'lain.bgm.tv/r/400/pic/cover/l'
      )
      const info = {
        cover: `https:${urlWithoutProtocol}`,
        title: title?.length ? title : '无标题',
      }
      ;(result as any)[key].push(info)
    })
  })
  const writePath = join(__dirname, './bangumi.json')
  fs.writeFileSync(writePath, JSON.stringify(result, null, 2), 'utf-8')
}

run()
