"use strict";
/**
 * パフォーマンスコントローラー
 *
 * @namespace controllers/performance
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const ttts_domain_1 = require("@motionpicture/ttts-domain");
const createDebug = require("debug");
const moment = require("moment");
const _ = require("underscore");
const debug = createDebug('ttts-api:controller:performance');
const DEFAULT_RADIX = 10;
const CATEGORY_WHEELCHAIR = '1';
/**
 * 検索する
 *
 * @memberof controllers/performance
 */
// tslint:disable-next-line:max-func-body-length
// tslint:disable-next-line:cyclomatic-complexity
function search(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        // tslint:disable-next-line:max-line-length
        const limit = (!_.isEmpty(req.query.limit)) ? parseInt(req.query.limit, DEFAULT_RADIX) : null;
        const page = (!_.isEmpty(req.query.page)) ? parseInt(req.query.page, DEFAULT_RADIX) : 1;
        // 上映日
        const day = (!_.isEmpty(req.query.day)) ? req.query.day : null;
        // 部門
        const section = (!_.isEmpty(req.query.section)) ? req.query.section : null;
        // フリーワード
        const words = (!_.isEmpty(req.query.words)) ? req.query.words : null;
        // この時間以降開始のパフォーマンスに絞る(timestamp milliseconds)
        // tslint:disable-line:max-line-length
        const startFrom = (!_.isEmpty(req.query.start_from)) ? parseInt(req.query.start_from, DEFAULT_RADIX) : null;
        // 劇場
        const theater = (!_.isEmpty(req.query.theater)) ? req.query.theater : null;
        // スクリーン
        const screen = (!_.isEmpty(req.query.screen)) ? req.query.screen : null;
        // パフォーマンスID
        const performanceId = (!_.isEmpty(req.query.performanceId)) ? req.query.performanceId : null;
        // 車椅子チェック要求
        const wheelchair = (!_.isEmpty(req.query.wheelchair)) ? req.query.wheelchair : false;
        // 検索条件を作成
        const andConditions = [
            { canceled: false }
        ];
        if (day !== null) {
            andConditions.push({ day: day });
        }
        if (theater !== null) {
            andConditions.push({ theater: theater });
        }
        if (screen !== null) {
            andConditions.push({ screen: screen });
        }
        if (performanceId !== null) {
            andConditions.push({ _id: performanceId });
        }
        if (startFrom !== null) {
            const now = moment(startFrom);
            // tslint:disable-next-line:no-magic-numbers
            const tomorrow = moment(startFrom).add(+24, 'hours');
            andConditions.push({
                $or: [
                    {
                        day: now.format('YYYYMMDD'),
                        start_time: { $gte: now.format('HHmm') }
                    },
                    {
                        day: { $gte: tomorrow.format('YYYYMMDD') }
                    }
                ]
            });
        }
        // 作品条件を追加する
        yield addFilmConditions(andConditions, section, words);
        let conditions = null;
        if (andConditions.length > 0) {
            conditions = { $and: andConditions };
        }
        // 作品件数取得
        const filmIds = yield ttts_domain_1.Models.Performance.distinct('film', conditions).exec();
        // 総数検索
        const performancesCount = yield ttts_domain_1.Models.Performance.count(conditions).exec();
        // 必要な項目だけ指定すること(レスポンスタイムに大きく影響するので)
        const fields = 'day open_time start_time end_time film screen screen_name theater theater_name ttts_extension';
        const query = ttts_domain_1.Models.Performance.find(conditions, fields);
        if (limit !== null) {
            query.skip(limit * (page - 1)).limit(limit);
        }
        query.populate('film', 'name sections.name minutes copyright');
        // 上映日、開始時刻
        query.setOptions({
            sort: {
                day: 1,
                start_time: 1
            }
        });
        const performances = yield query.lean(true).exec();
        // 空席情報を追加
        const performanceStatuses = yield ttts_domain_1.PerformanceStatusesModel.find().catch(() => undefined);
        const getStatus = (id) => {
            if (performanceStatuses !== undefined && performanceStatuses.hasOwnProperty(id)) {
                return performanceStatuses[id];
            }
            return null;
        };
        // 車椅子対応 2017/10
        const performanceIds = performances.map((performance) => {
            return performance._id.toString();
        });
        const wheelchairs = [];
        // 車椅子予約チェック要求ありの時
        if (wheelchair) {
            // 検索されたパフォーマンスに紐づく車椅子予約取得
            const conditionsWheelchair = {};
            conditionsWheelchair.performance = { $in: performanceIds };
            conditionsWheelchair['ticket_ttts_extension.category'] = CATEGORY_WHEELCHAIR;
            if (day !== null) {
                conditionsWheelchair.performance_day = day;
            }
            const reservations = yield ttts_domain_1.Models.Reservation.find(conditionsWheelchair, 'performance').exec();
            reservations.map((reservation) => {
                wheelchairs.push(reservation.performance);
            });
        }
        // ツアーナンバー取得(ttts_extensionのない過去データに備えて念のため作成)
        const getTourNumber = (performance) => {
            if (performance.hasOwnProperty('ttts_extension')) {
                return performance.ttts_extension.tour_number;
            }
            return '';
        };
        //---
        const data = performances.map((performance) => {
            return {
                type: 'performances',
                id: performance._id,
                attributes: {
                    day: performance.day,
                    open_time: performance.open_time,
                    start_time: performance.start_time,
                    end_time: performance.end_time,
                    //seat_status: (performanceStatuses !== undefined) ? performanceStatuses.getStatus(performance._id.toString()) : null,
                    seat_status: getStatus(performance._id.toString()),
                    theater_name: performance.theater_name,
                    screen_name: performance.screen_name,
                    film: performance.film._id,
                    film_name: performance.film.name,
                    film_sections: performance.film.sections.map((filmSection) => filmSection.name),
                    film_minutes: performance.film.minutes,
                    film_copyright: performance.film.copyright,
                    film_image: `${process.env.FRONTEND_ENDPOINT}/images/film/${performance.film._id}.jpg`,
                    tour_number: getTourNumber(performance),
                    wheelchair_reserved: wheelchairs.indexOf(performance._id.toString()) >= 0 ? true : false
                }
            };
        });
        res.json({
            meta: {
                number_of_performances: performancesCount,
                number_of_films: filmIds.length
            },
            data: data
        });
    });
}
exports.search = search;
/**
 * 作品に関する検索条件を追加する
 *
 * @param andConditions パフォーマンス検索条件
 * @param section 作品部門
 * @param words フリーワード
 */
function addFilmConditions(andConditions, section, words) {
    return __awaiter(this, void 0, void 0, function* () {
        const filmAndConditions = [];
        if (section !== null) {
            // 部門条件の追加
            filmAndConditions.push({ 'sections.code': { $in: [section] } });
        }
        // フリーワードの検索対象はタイトル(日英両方)
        // 空白つなぎでOR検索
        if (words !== null) {
            // trim and to half-width space
            words = words.replace(/(^\s+)|(\s+$)/g, '').replace(/\s/g, ' ');
            const orConditions = words.split(' ').filter((value) => (value.length > 0)).reduce((a, word) => {
                return a.concat({ 'name.ja': { $regex: `${word}` } }, { 'name.en': { $regex: `${word}` } });
            }, []);
            debug(orConditions);
            filmAndConditions.push({ $or: orConditions });
        }
        // 条件があれば作品検索してID条件として追加
        if (filmAndConditions.length > 0) {
            const filmIds = yield ttts_domain_1.Models.Film.distinct('_id', { $and: filmAndConditions }).exec();
            debug('filmIds:', filmIds);
            // 該当作品がない場合、filmIdsが空配列となりok
            andConditions.push({ film: { $in: filmIds } });
        }
    });
}
