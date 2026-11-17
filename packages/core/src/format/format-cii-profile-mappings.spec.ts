import { ValidationError } from 'ajv/dist/2019';
import { describe, expect, it } from 'vitest';

import { Invoice } from '../invoice/invoice.interface';
import { InvoiceServiceOptions } from '../invoice/invoice.service';
import { Logger } from '../logger.interface';
import { FormatCIIService } from './format-cii.service';
import { FormatFacturXBasicService } from './format-factur-x-basic.service';
import { FormatFacturXBasicWLService } from './format-factur-x-basic-wl.service';
import { FormatFacturXEN16931Service } from './format-factur-x-en16931.service';
import { FormatFacturXExtendedService } from './format-factur-x-extended.service';
import { FormatFacturXMinimumService } from './format-factur-x-minimum.service';
import { FormatFacturXXRechnungService } from './format-factur-x-xrechnung.service';
import { FormatXRECHNUNGCIIService } from './format-xrechnung-cii.service';

/**
 * The lowest Factur-X conformance level whose XSD contains an element.
 * Formats without a Factur-X profile (CII, XRechnung) contain everything.
 */
enum Level {
	Minimum = 0,
	BasicWL = 1,
	Basic = 2,
	EN16931 = 3,
	Extended = 4,
}

const formats = [
	['Factur-X-Minimum', FormatFacturXMinimumService, Level.Minimum],
	['Factur-X-BasicWL', FormatFacturXBasicWLService, Level.BasicWL],
	['Factur-X-Basic', FormatFacturXBasicService, Level.Basic],
	['Factur-X-EN16931', FormatFacturXEN16931Service, Level.EN16931],
	['Factur-X-Extended', FormatFacturXExtendedService, Level.Extended],
	['Factur-X-XRechnung', FormatFacturXXRechnungService, Level.Extended],
	['CII', FormatCIIService, Level.Extended],
	['XRECHNUNG-CII', FormatXRECHNUNGCIIService, Level.Extended],
] as const;

type MappingCase = {
	term: string;
	level: Level;
	data: Record<string, unknown>;
	marker: string;
	expected: RegExp;
};

const cases: MappingCase[] = [
	{
		term: 'BT-13 buyer order reference',
		level: Level.Minimum,
		data: { 'cac:OrderReference': { 'cbc:ID': 'PO-4711' } },
		marker: 'PO-4711',
		expected:
			/<ram:ApplicableHeaderTradeAgreement>[\s\S]*<ram:BuyerOrderReferencedDocument>\s*<ram:IssuerAssignedID>PO-4711<\/ram:IssuerAssignedID>\s*<\/ram:BuyerOrderReferencedDocument>[\s\S]*<\/ram:ApplicableHeaderTradeAgreement>/,
	},
	{
		term: 'BT-11 project reference',
		level: Level.EN16931,
		data: { 'cac:ProjectReference': { 'cbc:ID': 'PROJECT-11' } },
		marker: 'PROJECT-11',
		expected:
			/<ram:SpecifiedProcuringProject>\s*<ram:ID>PROJECT-11<\/ram:ID>\s*<ram:Name>PROJECT-11<\/ram:Name>\s*<\/ram:SpecifiedProcuringProject>\s*<\/ram:ApplicableHeaderTradeAgreement>/,
	},
	{
		term: 'BT-16 despatch advice reference without delivery details',
		level: Level.BasicWL,
		data: { 'cac:DespatchDocumentReference': { 'cbc:ID': 'DESPATCH-16' } },
		marker: 'DESPATCH-16',
		expected:
			/<\/ram:ApplicableHeaderTradeAgreement>\s*<ram:ApplicableHeaderTradeDelivery>\s*<ram:DespatchAdviceReferencedDocument>\s*<ram:IssuerAssignedID>DESPATCH-16<\/ram:IssuerAssignedID>\s*<\/ram:DespatchAdviceReferencedDocument>\s*<\/ram:ApplicableHeaderTradeDelivery>\s*<ram:ApplicableHeaderTradeSettlement>/,
	},
	{
		term: 'BT-16 despatch advice reference after the actual delivery',
		level: Level.BasicWL,
		data: {
			'cac:DespatchDocumentReference': { 'cbc:ID': 'DESPATCH-16' },
			'cac:Delivery': { 'cbc:ActualDeliveryDate': '2026-10-15' },
		},
		marker: 'DESPATCH-16',
		expected:
			/<ram:ApplicableHeaderTradeDelivery>\s*<ram:ActualDeliverySupplyChainEvent>[\s\S]*<\/ram:ActualDeliverySupplyChainEvent>\s*<ram:DespatchAdviceReferencedDocument>\s*<ram:IssuerAssignedID>DESPATCH-16<\/ram:IssuerAssignedID>\s*<\/ram:DespatchAdviceReferencedDocument>\s*<\/ram:ApplicableHeaderTradeDelivery>\s*<ram:ApplicableHeaderTradeSettlement>/,
	},
	{
		term: 'BT-15 receiving advice reference without delivery details',
		level: Level.EN16931,
		data: { 'cac:ReceiptDocumentReference': { 'cbc:ID': 'RECEIPT-15' } },
		marker: 'RECEIPT-15',
		expected:
			/<ram:ApplicableHeaderTradeDelivery>\s*<ram:ReceivingAdviceReferencedDocument>\s*<ram:IssuerAssignedID>RECEIPT-15<\/ram:IssuerAssignedID>\s*<\/ram:ReceivingAdviceReferencedDocument>\s*<\/ram:ApplicableHeaderTradeDelivery>\s*<ram:ApplicableHeaderTradeSettlement>/,
	},
	{
		term: 'BT-15 receiving advice reference after the despatch advice reference',
		level: Level.EN16931,
		data: {
			'cac:Delivery': { 'cbc:ActualDeliveryDate': '2026-10-15' },
			'cac:DespatchDocumentReference': { 'cbc:ID': 'DESPATCH-16' },
			'cac:ReceiptDocumentReference': { 'cbc:ID': 'RECEIPT-15' },
		},
		marker: 'RECEIPT-15',
		expected:
			/<\/ram:ActualDeliverySupplyChainEvent>\s*<ram:DespatchAdviceReferencedDocument>[\s\S]*<\/ram:DespatchAdviceReferencedDocument>\s*<ram:ReceivingAdviceReferencedDocument>\s*<ram:IssuerAssignedID>RECEIPT-15<\/ram:IssuerAssignedID>\s*<\/ram:ReceivingAdviceReferencedDocument>\s*<\/ram:ApplicableHeaderTradeDelivery>\s*<ram:ApplicableHeaderTradeSettlement>/,
	},
	{
		term: 'BT-20 payment terms',
		level: Level.BasicWL,
		data: { 'cac:PaymentTerms': { 'cbc:Note': 'TERMS-20' } },
		marker: 'TERMS-20',
		expected:
			/<ram:SpecifiedTradePaymentTerms>\s*<ram:Description>TERMS-20<\/ram:Description>/,
	},
	{
		term: 'BT-7 value added tax point date',
		level: Level.EN16931,
		data: { 'cbc:TaxPointDate': '2026-10-20' },
		marker: '20261020',
		expected:
			/<ram:ApplicableTradeTax>[\s\S]*<ram:CategoryCode>S<\/ram:CategoryCode>\s*<ram:TaxPointDate>\s*<udt:DateString format="102">20261020<\/udt:DateString>\s*<\/ram:TaxPointDate>\s*<ram:RateApplicablePercent>19<\/ram:RateApplicablePercent>/,
	},
	{
		term: 'BG-11 seller tax representative party',
		level: Level.BasicWL,
		data: {
			'cac:OrderReference': { 'cbc:ID': 'PO-4711' },
			'cac:TaxRepresentativeParty': {
				'cac:PartyName': { 'cbc:Name': 'TAXREP-62' },
				'cac:PostalAddress': {
					'cbc:StreetName': 'Rep Street 1',
					'cbc:CityName': 'Hamburg',
					'cbc:PostalZone': '20095',
					'cac:Country': { 'cbc:IdentificationCode': 'DE' },
				},
				'cac:PartyTaxScheme': {
					'cbc:CompanyID': 'DE987654321',
					'cac:TaxScheme': { 'cbc:ID': 'VAT' },
				},
			},
		},
		marker: 'TAXREP-62',
		expected:
			/<\/ram:BuyerTradeParty>\s*<ram:SellerTaxRepresentativeTradeParty>\s*<ram:Name>TAXREP-62<\/ram:Name>\s*<ram:PostalTradeAddress>\s*<ram:PostcodeCode>20095<\/ram:PostcodeCode>\s*<ram:LineOne>Rep Street 1<\/ram:LineOne>\s*<ram:CityName>Hamburg<\/ram:CityName>\s*<ram:CountryID>DE<\/ram:CountryID>\s*<\/ram:PostalTradeAddress>\s*<ram:SpecifiedTaxRegistration>\s*<ram:ID schemeID="VA">DE987654321<\/ram:ID>\s*<\/ram:SpecifiedTaxRegistration>\s*<\/ram:SellerTaxRepresentativeTradeParty>\s*<ram:BuyerOrderReferencedDocument>/,
	},
	{
		term: 'BT-17 tender or lot reference',
		level: Level.EN16931,
		data: {
			'cac:OriginatorDocumentReference': { 'cbc:ID': 'TENDER-17' },
			'cac:AdditionalDocumentReference': [{ 'cbc:ID': 'SUPPORTING-122' }],
		},
		marker: 'TENDER-17',
		expected:
			/<ram:AdditionalReferencedDocument>\s*<ram:IssuerAssignedID>SUPPORTING-122<\/ram:IssuerAssignedID>\s*<ram:TypeCode>916<\/ram:TypeCode>\s*<\/ram:AdditionalReferencedDocument>\s*<ram:AdditionalReferencedDocument>\s*<ram:IssuerAssignedID>TENDER-17<\/ram:IssuerAssignedID>\s*<ram:TypeCode>50<\/ram:TypeCode>\s*<\/ram:AdditionalReferencedDocument>/,
	},
	{
		term: 'BT-47 buyer legal registration identifier',
		level: Level.Minimum,
		data: {
			'cac:AccountingCustomerParty': {
				'cac:Party': {
					'cac:PartyLegalEntity': {
						'cbc:RegistrationName': 'Buyer',
						'cbc:CompanyID': 'BUYER-47',
						'cbc:CompanyID@schemeID': '0002',
					},
				},
			},
		},
		marker: 'BUYER-47',
		expected:
			/<ram:BuyerTradeParty>\s*<ram:Name>Buyer<\/ram:Name>\s*<ram:SpecifiedLegalOrganization>\s*<ram:ID schemeID="0002">BUYER-47<\/ram:ID>\s*<\/ram:SpecifiedLegalOrganization>\s*<\/ram:BuyerTradeParty>/,
	},
	{
		// The base invoice has no seller address, so the marker can only
		// come from the buyer.
		term: 'BG-8 buyer postal address',
		level: Level.BasicWL,
		data: {
			'cac:AccountingCustomerParty': {
				'cac:Party': {
					'cac:PostalAddress': {
						'cbc:StreetName': 'Buyer Street 8',
						'cbc:CityName': 'Vienna',
						'cbc:PostalZone': '1010',
						'cac:Country': { 'cbc:IdentificationCode': 'AT' },
					},
					'cac:PartyLegalEntity': { 'cbc:RegistrationName': 'Buyer' },
				},
			},
		},
		marker: '<ram:PostalTradeAddress>',
		expected:
			/<ram:BuyerTradeParty>\s*<ram:Name>Buyer<\/ram:Name>\s*<ram:PostalTradeAddress>\s*<ram:PostcodeCode>1010<\/ram:PostcodeCode>\s*<ram:LineOne>Buyer Street 8<\/ram:LineOne>\s*<ram:CityName>Vienna<\/ram:CityName>\s*<ram:CountryID>AT<\/ram:CountryID>\s*<\/ram:PostalTradeAddress>\s*<\/ram:BuyerTradeParty>/,
	},
	{
		term: 'BT-48 buyer VAT identifier',
		level: Level.BasicWL,
		data: {
			'cac:AccountingCustomerParty': {
				'cac:Party': {
					'cac:PartyTaxScheme': {
						'cbc:CompanyID': 'ATU48484848',
						'cac:TaxScheme': { 'cbc:ID': 'VAT' },
					},
					'cac:PartyLegalEntity': { 'cbc:RegistrationName': 'Buyer' },
				},
			},
		},
		marker: 'ATU48484848',
		expected:
			/<ram:BuyerTradeParty>\s*<ram:Name>Buyer<\/ram:Name>\s*<ram:SpecifiedTaxRegistration>\s*<ram:ID schemeID="VA">ATU48484848<\/ram:ID>\s*<\/ram:SpecifiedTaxRegistration>\s*<\/ram:BuyerTradeParty>/,
	},
];

const render = async (
	format: string,
	Service: (typeof formats)[number][1],
	data: Record<string, unknown>,
): Promise<string> => {
	const invoice = {
		'ubl:Invoice': {
			'cbc:ID': '4711',
			'cbc:BuyerReference': 'REF',
			'cac:AccountingSupplierParty': {
				'cac:Party': {
					'cac:PartyLegalEntity': {
						'cbc:RegistrationName': 'Seller',
					},
				},
			},
			'cac:AccountingCustomerParty': {
				'cac:Party': {
					'cac:PartyLegalEntity': { 'cbc:RegistrationName': 'Buyer' },
				},
			},
			'cac:TaxTotal': [
				{
					'cac:TaxSubtotal': [
						{
							'cac:TaxCategory': {
								'cbc:ID': 'S',
								'cbc:Percent': '19',
								'cac:TaxScheme': { 'cbc:ID': 'VAT' },
							},
						},
					],
				},
			],
			...data,
		},
	} as unknown as Invoice;

	const service = new Service({} as unknown as Logger);
	service.patchInvoice(invoice);
	service.fillInvoiceDefaults(invoice);

	return (await service.generate(invoice, {
		format,
		lang: 'en',
	} as InvoiceServiceOptions)) as string;
};

describe('CII mappings per Factur-X conformance level', () => {
	describe.each(cases)('$term', ({ level, data, marker, expected }) => {
		it.each(formats)(
			'is written by %s at the right position, or left out below its conformance level',
			async (format, Service, formatLevel) => {
				const xml = await render(format, Service, data);

				expect(typeof xml).toBe('string');
				if (formatLevel >= level) {
					expect(xml).toMatch(expected);
				} else {
					expect(xml).not.toContain(marker);
				}
			},
		);
	});
});

describe('Document-level VAT dates with several VAT breakdowns', () => {
	const subtotal = (percent: string) => ({
		'cac:TaxCategory': {
			'cbc:ID': 'S',
			'cbc:Percent': percent,
			'cac:TaxScheme': { 'cbc:ID': 'VAT' },
		},
	});

	const taxTotal = (subtotals: object[]) => ({
		'cac:TaxTotal': [{ 'cac:TaxSubtotal': subtotals }],
	});

	const threeBreakdowns = taxTotal([
		subtotal('19'),
		subtotal('7'),
		subtotal('10'),
	]);

	const headerBreakdowns = (xml: string): string[] =>
		xml
			.match(
				/<ram:ApplicableHeaderTradeSettlement>[\s\S]*<\/ram:ApplicableHeaderTradeSettlement>/,
			)?.[0]
			.match(
				/<ram:ApplicableTradeTax>[\s\S]*?<\/ram:ApplicableTradeTax>/g,
			) ?? [];

	const dates = [
		{
			term: 'BT-7 value added tax point date',
			level: Level.EN16931,
			data: { 'cbc:TaxPointDate': '2026-11-12' },
			element: '<ram:TaxPointDate>',
		},
		{
			term: 'BT-8 value added tax point date code',
			level: Level.BasicWL,
			data: { 'cac:InvoicePeriod': { 'cbc:DescriptionCode': '35' } },
			element: '<ram:DueDateTypeCode>29</ram:DueDateTypeCode>',
		},
	];

	describe.each(dates)('$term', ({ level, data, element }) => {
		it.each(formats)(
			'is written once by %s, in the first VAT breakdown',
			async (format, Service, formatLevel) => {
				const xml = await render(format, Service, {
					...threeBreakdowns,
					...data,
				});
				const [first, ...others] = headerBreakdowns(xml);

				expect(others).toHaveLength(
					formatLevel >= Level.BasicWL ? 2 : 0,
				);
				expect(xml.split(element)).toHaveLength(
					formatLevel >= level ? 2 : 1,
				);
				if (formatLevel >= level) {
					expect(first).toContain(element);
					expect(first).toContain(
						'<ram:RateApplicablePercent>19</ram:RateApplicablePercent>',
					);
				}
			},
		);
	});

	it('survives a VAT breakdown that maps to nothing', async () => {
		const xml = await render(
			'CII',
			FormatCIIService,
			taxTotal([subtotal('19'), {}, subtotal('7')]),
		);

		expect(headerBreakdowns(xml)).toHaveLength(2);
	});
});

describe('VAT totals in two currencies', () => {
	const vatTotals = (currencies: { document: string; tax?: string }) => ({
		'cbc:DocumentCurrencyCode': currencies.document,
		...(currencies.tax ? { 'cbc:TaxCurrencyCode': currencies.tax } : {}),
		'cac:TaxTotal': [
			{
				'cbc:TaxAmount': '19.00',
				'cbc:TaxAmount@currencyID': currencies.document,
				'cac:TaxSubtotal': [
					{
						'cbc:TaxableAmount': '100.00',
						'cbc:TaxableAmount@currencyID': currencies.document,
						'cbc:TaxAmount': '19.00',
						'cbc:TaxAmount@currencyID': currencies.document,
						'cac:TaxCategory': {
							'cbc:ID': 'S',
							'cbc:Percent': '19',
							'cac:TaxScheme': { 'cbc:ID': 'VAT' },
						},
					},
				],
			},
			...(currencies.tax
				? [
						{
							'cbc:TaxAmount': '17.11',
							'cbc:TaxAmount@currencyID': currencies.tax,
						},
					]
				: []),
		],
		'cac:LegalMonetaryTotal': {
			'cbc:LineExtensionAmount': '100.00',
			'cbc:LineExtensionAmount@currencyID': currencies.document,
			'cbc:TaxExclusiveAmount': '100.00',
			'cbc:TaxExclusiveAmount@currencyID': currencies.document,
			'cbc:TaxInclusiveAmount': '119.00',
			'cbc:TaxInclusiveAmount@currencyID': currencies.document,
			'cbc:PayableAmount': '119.00',
			'cbc:PayableAmount@currencyID': currencies.document,
		},
	});

	it.each(formats)(
		'are both written by %s with the VAT accounting currency, or only the one in the invoice currency without it',
		async (format, Service, formatLevel) => {
			const xml = await render(
				format,
				Service,
				vatTotals({ document: 'USD', tax: 'EUR' }),
			);

			expect(xml).toContain(
				'<ram:TaxTotalAmount currencyID="USD">19.00</ram:TaxTotalAmount>',
			);
			if (formatLevel >= Level.BasicWL) {
				expect(xml).toMatch(
					/<ram:TaxCurrencyCode>EUR<\/ram:TaxCurrencyCode>\s*<ram:InvoiceCurrencyCode>USD<\/ram:InvoiceCurrencyCode>/,
				);
				expect(xml).toContain(
					'<ram:TaxTotalAmount currencyID="EUR">17.11</ram:TaxTotalAmount>',
				);
			} else {
				expect(xml).not.toContain('<ram:TaxCurrencyCode>');
				expect(xml).not.toContain('currencyID="EUR"');
			}
		},
	);

	it.each(formats)(
		'keep the single VAT total of %s when there is no VAT accounting currency',
		async (format, Service) => {
			const xml = await render(
				format,
				Service,
				vatTotals({ document: 'EUR' }),
			);

			expect(xml.match(/<ram:TaxTotalAmount\b/g)).toHaveLength(1);
			expect(xml).toContain(
				'<ram:TaxTotalAmount currencyID="EUR">19.00</ram:TaxTotalAmount>',
			);
		},
	);

	it('keep the VAT total in the invoice currency of Factur-X-Minimum when the VAT accounting currency is the same', async () => {
		const xml = await render(
			'Factur-X-Minimum',
			FormatFacturXMinimumService,
			vatTotals({ document: 'EUR', tax: 'EUR' }),
		);

		expect(xml).toContain(
			'<ram:TaxTotalAmount currencyID="EUR">19.00</ram:TaxTotalAmount>',
		);
	});
});

describe('Line allowances and charges', () => {
	const invoiceLine = (chargeIndicator: string) => ({
		'cac:InvoiceLine': [
			{
				'cbc:ID': '1',
				'cbc:InvoicedQuantity': '1',
				'cbc:InvoicedQuantity@unitCode': 'C62',
				'cbc:LineExtensionAmount': '118.09',
				'cbc:LineExtensionAmount@currencyID': 'EUR',
				'cac:AllowanceCharge': [
					{
						'cbc:ChargeIndicator': chargeIndicator,
						'cbc:AllowanceChargeReason': 'REASON-139',
						'cbc:MultiplierFactorNumeric': '13.8',
						'cbc:Amount': '18.91',
						'cbc:Amount@currencyID': 'EUR',
						'cbc:BaseAmount': '137.00',
						'cbc:BaseAmount@currencyID': 'EUR',
					},
				],
				'cac:Item': {
					'cbc:Name': 'Item',
					'cac:ClassifiedTaxCategory': {
						'cbc:ID': 'S',
						'cbc:Percent': '19',
						'cac:TaxScheme': { 'cbc:ID': 'VAT' },
					},
				},
				'cac:Price': {
					'cbc:PriceAmount': '137.00',
					'cbc:PriceAmount@currencyID': 'EUR',
				},
			},
		],
	});

	const lineAllowanceCharge = (xml: string): string | undefined =>
		xml.match(
			/<ram:SpecifiedLineTradeSettlement>[\s\S]*?<ram:SpecifiedTradeAllowanceCharge>([\s\S]*?)<\/ram:SpecifiedTradeAllowanceCharge>/,
		)?.[1];

	const kinds = [
		{ term: 'allowance (BG-27)', chargeIndicator: 'false' },
		{ term: 'charge (BG-28)', chargeIndicator: 'true' },
	];

	describe.each(kinds)('$term', ({ chargeIndicator }) => {
		const indicator = `^\\s*<ram:ChargeIndicator>\\s*<udt:Indicator>${chargeIndicator}</udt:Indicator>\\s*</ram:ChargeIndicator>\\s*`;
		const percentAndBase =
			'<ram:CalculationPercent>13\\.8</ram:CalculationPercent>\\s*<ram:BasisAmount>137\\.00</ram:BasisAmount>\\s*';
		const amountAndReason =
			'<ram:ActualAmount>18\\.91</ram:ActualAmount>\\s*<ram:Reason>REASON-139</ram:Reason>\\s*$';

		it.each(formats)(
			'is written by %s, with the percentage and base amount from EN16931 up',
			async (format, Service, formatLevel) => {
				const xml = await render(
					format,
					Service,
					invoiceLine(chargeIndicator),
				);
				const allowanceCharge = lineAllowanceCharge(xml);

				if (formatLevel < Level.Basic) {
					expect(allowanceCharge).toBeUndefined();
				} else if (formatLevel < Level.EN16931) {
					expect(allowanceCharge).toMatch(
						new RegExp(indicator + amountAndReason),
					);
				} else {
					expect(allowanceCharge).toMatch(
						new RegExp(
							indicator + percentAndBase + amountAndReason,
						),
					);
				}
			},
		);
	});
});

describe('Rounding amount (BT-114)', () => {
	const totals = (rounding: string, payable: string) => ({
		'cbc:DocumentCurrencyCode': 'EUR',
		'cac:TaxTotal': [
			{
				'cbc:TaxAmount': '19.00',
				'cbc:TaxAmount@currencyID': 'EUR',
				'cac:TaxSubtotal': [
					{
						'cbc:TaxableAmount': '99.99',
						'cbc:TaxableAmount@currencyID': 'EUR',
						'cbc:TaxAmount': '19.00',
						'cbc:TaxAmount@currencyID': 'EUR',
						'cac:TaxCategory': {
							'cbc:ID': 'S',
							'cbc:Percent': '19',
							'cac:TaxScheme': { 'cbc:ID': 'VAT' },
						},
					},
				],
			},
		],
		'cac:LegalMonetaryTotal': {
			'cbc:LineExtensionAmount': '99.99',
			'cbc:LineExtensionAmount@currencyID': 'EUR',
			'cbc:TaxExclusiveAmount': '99.99',
			'cbc:TaxExclusiveAmount@currencyID': 'EUR',
			'cbc:TaxInclusiveAmount': '118.99',
			'cbc:TaxInclusiveAmount@currencyID': 'EUR',
			'cbc:PrepaidAmount': '50.00',
			'cbc:PrepaidAmount@currencyID': 'EUR',
			'cbc:PayableRoundingAmount': rounding,
			'cbc:PayableRoundingAmount@currencyID': 'EUR',
			'cbc:PayableAmount': payable,
			'cbc:PayableAmount@currencyID': 'EUR',
		},
	});

	it.each(formats)(
		'is written by %s from EN16931 up, refused below it, and left out by Factur-X-Minimum',
		async (format, Service, formatLevel) => {
			const xml = render(format, Service, totals('0.01', '69.00'));

			if (formatLevel >= Level.EN16931) {
				expect(await xml).toMatch(
					/<ram:TaxTotalAmount currencyID="EUR">19.00<\/ram:TaxTotalAmount>\s*<ram:RoundingAmount>0.01<\/ram:RoundingAmount>\s*<ram:GrandTotalAmount>118.99<\/ram:GrandTotalAmount>/,
				);
			} else if (formatLevel >= Level.BasicWL) {
				await expect(xml).rejects.toBeInstanceOf(ValidationError);
				await expect(xml).rejects.toMatchObject({
					errors: [
						{
							instancePath:
								'/ubl:Invoice/cac:LegalMonetaryTotal/cbc:PayableRoundingAmount',
							message: expect.stringMatching(
								/BT-114.*BASIC.*BASIC WL.*EN16931/,
							),
						},
					],
				});
			} else {
				expect(await xml).not.toContain('<ram:RoundingAmount>');
			}
		},
	);

	it.each(
		formats.filter(
			([, , level]) => level === Level.Basic || level === Level.BasicWL,
		),
	)('is left out by %s when it is zero', async (format, Service) => {
		const xml = await render(format, Service, totals('0.00', '68.99'));

		expect(xml).not.toContain('<ram:RoundingAmount>');
		expect(xml).toContain(
			'<ram:DuePayableAmount>68.99</ram:DuePayableAmount>',
		);
	});
});
