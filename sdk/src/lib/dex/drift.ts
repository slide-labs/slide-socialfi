import {
  initialize,
  DriftClient,
  getMarketsAndOraclesForSubscription,
  BulkAccountLoader,
  User,
  DriftEnv,
  SpotMarkets,
  PerpMarkets,
  calculateBidAskPrice,
  convertToNumber,
  calculateEstimatedSpotEntryPrice,
  getUserAccountPublicKeySync,
  ReferrerInfo,
  DLOB,
  PositionDirection,
  ONE,
  SerumSubscriber,
  SpotMarketAccount,
  SpotMarketConfig,
  PerpMarketConfig
} from '@drift-labs/sdk'
import { AnchorProvider, BN } from '@project-serum/anchor'
import { PublicKey, Connection } from '@solana/web3.js'
import { Wallet } from '../../types/wallet'
import { getAssociatedTokenAddress } from '@solana/spl-token'

export default class Drift {
  public env: DriftEnv
  public connection: Connection
  public anchorProvider: AnchorProvider
  public sdkConfig: any
  public driftPublicKey: PublicKey
  public spotMarkets: SpotMarketConfig[]
  public perpMarkets: PerpMarketConfig[]
  public driftClient: DriftClient
  public user: User
  public wallet: Wallet

  serumSubscriber: SerumSubscriber

  private bulkAccountLoader: BulkAccountLoader

  constructor(wallet: Wallet, env: DriftEnv, connection: Connection) {
    this.wallet = wallet
    this.env = env
    this.connection = connection

    this.anchorProvider = new AnchorProvider(
      this.connection,
      this.wallet,
      AnchorProvider.defaultOptions()
    )

    this.sdkConfig = initialize({ env: this.env })

    this.driftPublicKey = new PublicKey(this.sdkConfig.DRIFT_PROGRAM_ID)
    this.spotMarkets = SpotMarkets[this.env]
    this.perpMarkets = PerpMarkets[this.env]

    this.bulkAccountLoader = new BulkAccountLoader(
      this.connection,
      'confirmed',
      1000
    )

    this.driftClient = new DriftClient({
      connection: this.connection,
      wallet: this.anchorProvider.wallet,
      programID: this.driftPublicKey,
      ...getMarketsAndOraclesForSubscription(this.env),
      accountSubscription: {
        type: 'polling',
        accountLoader: this.bulkAccountLoader
      }
    })
  }

  init = async () => {
    try {
      await this.driftClient.subscribe()

      const driftAcc = getUserAccountPublicKeySync(
        this.driftPublicKey,
        this.wallet.publicKey
      )

      this.user = new User({
        driftClient: this.driftClient,
        userAccountPublicKey: driftAcc,
        accountSubscription: {
          type: 'polling',
          accountLoader: this.bulkAccountLoader
        }
      })

      await this.user.subscribe()

      await this.initializeAccount()
    } catch {}
  }

  initializeAccount = async () => {
    try {
      const userAccountExists = await this.user.exists()

      if (userAccountExists) return true

      const ref = await this.getReferrerInfo('dannpl')

      await this.user.driftClient.initializeUserAccount(
        undefined,
        undefined,
        ref
      )
    } catch {
      return false
    }
  }

  unsubscribe = async () => {
    if (!this.user || !this.driftClient) return

    await this.user.unsubscribe()
    await this.driftClient.unsubscribe()
  }

  fetchSpotMarket = (symbol: string | undefined, marketIndex?: number) => {
    return this.spotMarkets.find(
      (market) => market.symbol === symbol || market.marketIndex === marketIndex
    )
  }

  fetchPerpMarket = (symbol?: string, marketIndex?: number) => {
    return this.perpMarkets.find(
      (market) =>
        market.baseAssetSymbol === symbol || market.marketIndex === marketIndex
    )
  }

  fetchOraclePrice = (symbol: string) => {
    try {
      const makertInfo = this.fetchPerpMarket(symbol)

      if (!makertInfo) return null

      return this.user.driftClient.getOracleDataForPerpMarket(
        makertInfo.marketIndex
      )
    } catch {
      return null
    }
  }

  depositCollateral = async (amount: number, symbol: string) => {
    try {
      await this.initializeAccount()

      const marketInfo = this.fetchSpotMarket(symbol)

      let collateralAccountPublicKey = this.user.driftClient.authority

      if (symbol === 'USDC') {
        collateralAccountPublicKey = await getAssociatedTokenAddress(
          this.sdkConfig.USDC_MINT_ADDRESS,
          this.wallet.publicKey
        )
      }

      const newAmount = amount * 10 ** 6
      const depositAmount = new BN(newAmount)

      const deposit = await this.user.driftClient.deposit(
        depositAmount,
        marketInfo.marketIndex,
        collateralAccountPublicKey
      )

      return deposit
    } catch {}
  }

  fetchPrice = (symbol: string) => {
    try {
      const marketInfo = this.fetchPerpMarket(symbol)

      if (!marketInfo) return null

      const perpMarketAccount = this.driftClient.getPerpMarketAccount(
        marketInfo.marketIndex
      )

      if (!perpMarketAccount) return null

      const oraclePriceData = this.fetchOraclePrice(symbol)

      const bidAskPrice = calculateBidAskPrice(
        perpMarketAccount.amm,
        oraclePriceData
      )

      return [convertToNumber(bidAskPrice[0]), convertToNumber(bidAskPrice[1])]
    } catch {}
  }

  fetchSpotAssetPrice = async (marketIndex: number, address: string) => {
    try {
      const marketInfo = this.fetchSpotMarket(undefined, marketIndex)

      if (!marketInfo) return null

      const serum = new SerumSubscriber({
        connection: this.connection,
        programId: new PublicKey('srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX'),
        marketAddress: new PublicKey(address),
        accountSubscription: {
          type: 'polling',
          accountLoader: this.bulkAccountLoader
        }
      })

      await serum.subscribe()

      const dlob = new DLOB()
      const slot = await this.driftClient.connection.getSlot()
      const oraclePriceData =
        this.driftClient.getOracleDataForSpotMarket(marketIndex)
      const market: SpotMarketAccount =
        this.driftClient.getSpotMarketAccount(marketIndex)

      const short: number = convertToNumber(
        calculateEstimatedSpotEntryPrice(
          'base',
          new BN(ONE),
          PositionDirection.SHORT,
          market,
          oraclePriceData,
          dlob,
          serum.bids,
          serum.asks,
          slot
        ).bestPrice
      )

      const long: number = convertToNumber(
        calculateEstimatedSpotEntryPrice(
          'base',
          new BN(ONE),
          PositionDirection.LONG,
          market,
          oraclePriceData,
          dlob,
          serum.bids,
          serum.asks,
          slot
        ).bestPrice
      )

      const diff = long - short
      const lowerValue = long > short ? short : long

      serum.unsubscribe()

      return lowerValue + diff / 2
    } catch {}
  }

  getReferrerInfo = async (referrerName: string): Promise<ReferrerInfo> => {
    let referrerInfo: ReferrerInfo = undefined

    try {
      const referrerNameAccount =
        await this.driftClient.fetchReferrerNameAccount(referrerName)

      if (referrerNameAccount) {
        referrerInfo = {
          referrer: referrerNameAccount.user,
          referrerStats: referrerNameAccount.userStats
        }
      }
    } catch (err) {
      return undefined
    }

    return referrerInfo
  }
}
